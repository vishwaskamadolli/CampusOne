import { Router } from "express";
import mongoose from "mongoose";
import { allowRoles, requireAuth, requireTenant } from "../middleware/auth.js";
import {
  AcademicYear,
  AttendanceSession,
  Course,
  Department,
  ParentStudentLink,
  Section,
  Student,
  Subject,
  StreamSubjectMapping,
  Teacher,
  Timetable,
  TimetableSettings,
} from "../models/domain.models.js";
import { ensureSimplifiedAcademicStructure } from "../services/academic-structure.js";
import { getOrCreateTimetableSettings, validateTimetableSettings } from "../services/timetable-settings.js";

export const timetablesRouter = Router();
timetablesRouter.use(requireAuth, requireTenant);
timetablesRouter.use((req, res, next) => {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
timetablesRouter.use(async (req, _res, next) => { try { await ensureSimplifiedAcademicStructure(req.tenantId); next(); } catch (error) { next(error); } });
const populated = [
  { path: "academicYearId courseId departmentId sectionId", select: "name" },
  { path: "entries.subjectId", select: "name code" },
  { path: "entries.teacherId", populate: { path: "userId", select: "name" } },
  { path: "entries.substituteTeacherId", populate: { path: "userId", select: "name" } },
];
const overlaps = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime;

export function applyCollegeTimetableSettings(body, settings, existingEntries = []) {
  const timings = settings.timings.map((timing) => ({ ...timing.toObject?.() || timing, timingId: String(timing._id) }));
  const incoming = Array.isArray(body.entries) ? body.entries : [];
  const entries = [];
  for (const day of settings.workingDays) {
    for (const timing of timings) {
      const supplied = incoming.find((entry) => entry.day === day && (String(entry.timingId || "") === timing.timingId || (entry.startTime === timing.startTime && entry.endTime === timing.endTime)));
      const existing = existingEntries.find((entry) => entry.day === day && (String(entry.timingId || "") === timing.timingId || (entry.startTime === timing.startTime && entry.endTime === timing.endTime)));
      if (timing.type === "period" && !supplied?.subjectId && !supplied?.teacherId) continue;
      entries.push({
        ...(existing?._id ? { _id: existing._id } : {}),
        day, timingId: timing.timingId, startTime: timing.startTime, endTime: timing.endTime,
        type: timing.type, label: timing.label,
        ...(timing.type === "period" ? { subjectId: supplied?.subjectId, teacherId: supplied?.teacherId, substituteTeacherId: supplied?.substituteTeacherId || undefined, subjectOverride: supplied?.subjectOverride === true, room: supplied?.room } : {}),
      });
    }
  }
  return { ...body, workingDays: [...settings.workingDays], periodTimings: timings.map(({ timingId: _timingId, _id: _id, ...timing }) => timing), entries };
}

export function validateAcademicRelationships(body, refs) {
  if (!refs.academicYear) return "Academic Year is invalid or unavailable";
  if (!refs.course) return "Class is invalid or unavailable";
  if (!refs.stream) return "Stream is invalid or unavailable";
  if (!refs.section) return "Section is invalid or unavailable";
  if (String(refs.section.courseId) !== String(body.courseId) || String(refs.section.departmentId) !== String(body.departmentId)) return "Selected Section does not belong to the selected class and stream";
  return null;
}

export function validateEntrySchedule(entry, workingDays, index = 0) {
  const prefix = `Entry ${index + 1}`;
  if (!workingDays.includes(entry.day)) return `${prefix}: ${entry.day || "selected day"} is not enabled as a working day`;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(entry.startTime || "")) return `${prefix}: start time is missing or invalid`;
  if (!timePattern.test(entry.endTime || "")) return `${prefix}: end time is missing or invalid`;
  if (entry.startTime >= entry.endTime) return `${prefix}: end time must be later than start time`;
  return null;
}

async function validatePayload(req, currentId) {
  const body = req.body;
  const idFields = [
    ["academicYearId", "Academic Year"], ["courseId", "Class"], ["departmentId", "Stream"], ["sectionId", "Section"],
  ];
  const invalidId = idFields.find(([key]) => !mongoose.isValidObjectId(body[key]));
  if (invalidId) return `${invalidId[1]} must contain a valid record ID`;
  if (!Array.isArray(body.workingDays) || !body.workingDays.length) return "At least one working day is required";
  if (!Array.isArray(body.entries)) return "Timetable entries are required";
  const scoped = { tenantId: req.tenantId };
  const [academicYear, course, stream, section] = await Promise.all([
    AcademicYear.findOne({ ...scoped, _id: body.academicYearId, isActive: { $ne: false } }).select("_id").lean(),
    Course.findOne({ ...scoped, _id: body.courseId, isActive: { $ne: false } }).select("_id").lean(),
    Department.findOne({ ...scoped, _id: body.departmentId, isActive: { $ne: false } }).select("_id").lean(),
    Section.findOne({ ...scoped, _id: body.sectionId, isActive: { $ne: false } }).select("courseId departmentId").lean(),
  ]);
  const academicError = validateAcademicRelationships(body, { academicYear, course, stream, section });
  if (academicError) return academicError;
  for (const [index, entry] of body.entries.entries()) {
    const scheduleError = validateEntrySchedule(entry, body.workingDays, index);
    if (scheduleError) return scheduleError;
    if (entry.type === "period") {
      if (!mongoose.isValidObjectId(entry.subjectId) || !mongoose.isValidObjectId(entry.teacherId))
        return `Entry ${index + 1} requires a subject and teacher`;
      const [subject, mapping, teacher, substituteTeacher] = await Promise.all([
        Subject.findOne({ ...scoped, _id: entry.subjectId, isActive: { $ne: false } }).select("departmentId").lean(),
        StreamSubjectMapping.exists({ ...scoped, streamId: body.departmentId, subjectId: entry.subjectId, isActive: true }),
        Teacher.findOne({ ...scoped, _id: entry.teacherId, isActive: true }).select("teachingSubjectIds").lean(),
        entry.substituteTeacherId ? Teacher.findOne({ ...scoped, _id: entry.substituteTeacherId, isActive: true }).select("teachingSubjectIds").lean() : true,
      ]);
      if (!subject || (!mapping && String(subject.departmentId || "") !== String(body.departmentId)) || !teacher || !substituteTeacher) return `Entry ${index + 1} has an invalid subject, stream mapping, or teacher`;
      const canTeach = (candidate) => candidate === true || candidate.teachingSubjectIds?.some((value) => String(value) === String(entry.subjectId));
      if ((!canTeach(teacher) || !canTeach(substituteTeacher)) && entry.subjectOverride !== true)
        return `Entry ${index + 1}: selected teacher is not assigned to this subject. Confirm an admin override to continue`;
    }
    if (body.entries.slice(0, index).some((other) => other.day === entry.day && overlaps(other, entry)))
      return `Entry ${index + 1} overlaps another entry in this timetable`;
  }
  const external = await Timetable.find({
    ...scoped,
    ...(currentId ? { _id: { $ne: currentId } } : {}),
    "entries.day": { $in: body.entries.map((entry) => entry.day) },
  }).lean();
  for (const entry of body.entries.filter((item) => item.type === "period")) {
    for (const timetable of external) {
      for (const other of timetable.entries.filter((item) => item.day === entry.day && item.type === "period" && overlaps(item, entry))) {
        const assignedTeachers = [entry.teacherId, entry.substituteTeacherId].filter(Boolean).map(String);
        const otherTeachers = [other.teacherId, other.substituteTeacherId].filter(Boolean).map(String);
        if (assignedTeachers.some((teacherId) => otherTeachers.includes(teacherId))) return `Teacher conflict on ${entry.day} at ${entry.startTime}`;
        if (String(timetable.courseId) === String(body.courseId) && String(timetable.departmentId) === String(body.departmentId) && String(timetable.sectionId) === String(body.sectionId)) return `Class conflict on ${entry.day} at ${entry.startTime}`;
        if (entry.room && other.room && entry.room.toLowerCase() === other.room.toLowerCase()) return `Room conflict on ${entry.day} at ${entry.startTime}`;
      }
    }
  }
  return null;
}

timetablesRouter.get("/", async (req, res, next) => {
  try {
    let filter = { tenantId: req.tenantId };
    if (req.user.roles.includes("teacher")) {
      const teacher = await Teacher.findOne({ tenantId: req.tenantId, userId: req.user.id, isActive: true });
      filter = { ...filter, $or: [{ "entries.teacherId": teacher?._id }, { "entries.substituteTeacherId": teacher?._id }], status: "published" };
    } else if (req.user.roles.includes("parent")) {
      const link = await ParentStudentLink.findOne({ tenantId: req.tenantId, parentUserId: req.user.id, studentId: req.query.studentId, verified: true });
      if (!link) return res.status(403).json({ message: "Child access denied" });
      const student = await Student.findOne({ tenantId: req.tenantId, _id: req.query.studentId });
      filter = { ...filter, courseId: student?.courseId, departmentId: student?.departmentId, sectionId: student?.sectionId, status: "published" };
    } else if (!req.user.roles.includes("admin")) return res.status(403).json({ message: "Insufficient permissions" });
    for (const key of ["academicYearId", "courseId", "departmentId", "sectionId"]) if (req.query[key]) filter[key] = req.query[key];
    let rows = await Timetable.find(filter).populate(populated).sort({ updatedAt: -1 }).lean();
    if (req.user.roles.includes("teacher")) {
      const teacher = await Teacher.findOne({ tenantId: req.tenantId, userId: req.user.id, isActive: true });
      rows = rows.map((row) => ({ ...row, entries: row.entries.filter((entry) => String(entry.teacherId?._id) === String(teacher?._id) || String(entry.substituteTeacherId?._id) === String(teacher?._id)) }));
    }
    return res.json(rows);
  } catch (error) { return next(error); }
});

timetablesRouter.get("/settings", async (req, res, next) => {
  try {
    const settings = await getOrCreateTimetableSettings(req.tenantId);
    const locked = Boolean(await Timetable.exists({ tenantId: req.tenantId }));
    return res.json({ ...settings.toObject(), locked });
  } catch (error) { return next(error); }
});

timetablesRouter.put("/settings", allowRoles("admin"), async (req, res, next) => {
  try {
    const error = validateTimetableSettings(req.body);
    if (error) return res.status(400).json({ message: error });
    const current = await getOrCreateTimetableSettings(req.tenantId);
    const locked = Boolean(await Timetable.exists({ tenantId: req.tenantId }));
    const structuralChange = JSON.stringify(current.workingDays) !== JSON.stringify(req.body.workingDays) || JSON.stringify(current.timings.map(({ label, startTime, endTime, type }) => ({ label, startTime, endTime, type }))) !== JSON.stringify(req.body.timings.map(({ label, startTime, endTime, type }) => ({ label, startTime, endTime, type })));
    if (locked && structuralChange) return res.status(409).json({ message: "College timetable settings cannot be changed after section timetables exist" });
    const settings = await TimetableSettings.findOneAndUpdate({ tenantId: req.tenantId }, { $set: { workingDays: req.body.workingDays, timings: req.body.timings } }, { new: true, upsert: true, runValidators: true });
    return res.json({ ...settings.toObject(), locked });
  } catch (error) { return next(error); }
});

timetablesRouter.post("/", allowRoles("admin"), async (req, res, next) => {
  try {
    const settings = await getOrCreateTimetableSettings(req.tenantId);
    req.body = applyCollegeTimetableSettings(req.body, settings);
    const error = await validatePayload(req);
    if (error) return res.status(400).json({ message: error });
    const { classId: _legacyClassId, tenantId: _tenantId, ...body } = req.body;
    return res.status(201).json(await Timetable.create({ ...body, tenantId: req.tenantId, status: "draft" }));
  } catch (error) { return next(error); }
});

timetablesRouter.patch("/:id", allowRoles("admin"), async (req, res, next) => {
  try {
    const existing = await Timetable.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!existing) return res.status(404).json({ message: "Timetable not found" });
    const { tenantId: _tenantId, classId: _legacyClassId, ...changes } = req.body;
    const settings = await getOrCreateTimetableSettings(req.tenantId);
    const payload = { ...existing, ...applyCollegeTimetableSettings(changes, settings, existing.entries), tenantId: req.tenantId, status: changes.status || existing.status || "draft" };
    req.body = payload;
    const error = await validatePayload(req, req.params.id);
    if (error) return res.status(400).json({ message: error });
    const item = await Timetable.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: payload }, { new: true, runValidators: true });
    return res.json(item);
  } catch (error) { return next(error); }
});

timetablesRouter.patch("/:id/publish", allowRoles("admin"), async (req, res, next) => {
  try {
    const existing = await Timetable.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!existing) return res.status(404).json({ message: "Timetable not found" });
    if (!existing.entries.some((entry) => entry.type === "period")) return res.status(400).json({ message: "Add at least one teaching period before publishing" });
    req.body = existing;
    const validationError = await validatePayload(req, req.params.id);
    if (validationError) return res.status(400).json({ message: validationError });
    const item = await Timetable.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: { status: "published", publishedAt: new Date() } }, { new: true });
    if (!item) return res.status(404).json({ message: "Timetable not found" });
    return res.json(item);
  } catch (error) { return next(error); }
});

timetablesRouter.delete("/:id", allowRoles("admin"), async (req, res, next) => {
  try {
    if (await AttendanceSession.exists({ tenantId: req.tenantId, timetableId: req.params.id }))
      return res.status(409).json({ message: "Timetables linked to attendance cannot be deleted" });
    const item = await Timetable.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId, status: "draft" });
    if (!item) return res.status(404).json({ message: "Timetable not found" });
    return res.status(204).end();
  } catch (error) { return next(error); }
});
