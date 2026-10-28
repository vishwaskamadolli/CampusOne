import { Router } from "express";
import mongoose from "mongoose";
import { allowRoles, requireAuth, requireTenant } from "../middleware/auth.js";
import { ensureSimplifiedAcademicStructure } from "../services/academic-structure.js";
import { getOrCreateTimetableSettings } from "../services/timetable-settings.js";
import {
  AttendanceAudit,
  AttendanceCorrection,
  AttendanceRecord,
  AttendanceSession,
  AcademicYear,
  Notification,
  ParentStudentLink,
  Student,
  Teacher,
  ClassTeacherAssignment,
  Timetable,
} from "../models/domain.models.js";

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth, requireTenant);
attendanceRouter.use((req, res, next) => {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
attendanceRouter.use(async (req, _res, next) => { try { await ensureSimplifiedAcademicStructure(req.tenantId); next(); } catch (error) { next(error); } });
const statuses = ["present", "absent", "late", "excused"];
const dayName = (date) => new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date(`${date}T06:30:00Z`));
export function isValidAttendanceDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
export function attendanceAvailability(date, startTime, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (date < today) return { allowed: true };
  if (date > today) return { allowed: false, reason: "Attendance cannot be submitted for a future date" };
  const currentTime = `${parts.hour}:${parts.minute}`;
  if (startTime > currentTime) return { allowed: false, reason: `Attendance opens at ${startTime}` };
  return { allowed: true };
}

async function currentTeacher(req) {
  return Teacher.findOne({ tenantId: req.tenantId, userId: req.user.id, isActive: true });
}
async function teacherOwnsSession(tenantId, teacher, session) {
  if (!teacher) return false;
  if (String(session.teacherId) === String(teacher._id)) return true;
  if (!session.timetableId || !session.timetableEntryId) return false;
  const timetable = await Timetable.findOne({ _id: session.timetableId, tenantId, status: "published" }).select("entries");
  const entry = timetable?.entries.id(session.timetableEntryId);
  return Boolean(entry && (String(entry.teacherId) === String(teacher._id) || String(entry.substituteTeacherId) === String(teacher._id)));
}

attendanceRouter.get("/today", allowRoles("teacher"), async (req, res, next) => {
  try {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    if (!isValidAttendanceDate(date))
      return res.status(400).json({ message: "Date must be a valid YYYY-MM-DD value" });
    const teacher = await currentTeacher(req);
    if (!teacher) return res.json([]);
    const selectedDate = new Date(`${date}T06:30:00Z`);
    const academicYear = await AcademicYear.findOne({
      tenantId: req.tenantId,
      startDate: { $lte: selectedDate },
      endDate: { $gte: selectedDate },
      isActive: { $ne: false },
    }).select("_id").lean();
    if (!academicYear) return res.json([]);
    const settings = await getOrCreateTimetableSettings(req.tenantId);
    const teachingTimings = settings.timings.filter((timing) => timing.type === "period");
    const timetables = await Timetable.find({ tenantId: req.tenantId, academicYearId: academicYear._id, status: "published", "entries.day": dayName(date), $or: [{ "entries.teacherId": teacher._id }, { "entries.substituteTeacherId": teacher._id }] })
      .populate("courseId departmentId sectionId")
      .populate("entries.subjectId")
      .populate({ path: "entries.teacherId", populate: { path: "userId", select: "name" } })
      .populate({ path: "entries.substituteTeacherId", populate: { path: "userId", select: "name" } })
      .lean();
    const submitted = await AttendanceSession.find({ tenantId: req.tenantId, date }).select("timetableEntryId").lean();
    const submittedMap = new Map(submitted.map((item) => [String(item.timetableEntryId), item._id]));
    const rows = [];
    for (const timetable of timetables) {
      const periods = timetable.entries.filter((entry) => entry.type === "period" && entry.day === dayName(date)).sort((a, b) => a.startTime.localeCompare(b.startTime));
      periods.forEach((entry) => {
        const scheduled = String(entry.teacherId?._id) === String(teacher._id);
        const substitute = String(entry.substituteTeacherId?._id) === String(teacher._id);
        if (!scheduled && !substitute) return;
        const period = teachingTimings.findIndex((timing) => String(timing._id) === String(entry.timingId || "") || (timing.startTime === entry.startTime && timing.endTime === entry.endTime)) + 1;
        const availability = attendanceAvailability(date, entry.startTime);
        const submittedStatus = submittedMap.has(String(entry._id));
        rows.push({ timetableId: timetable._id, periodId: entry._id, entryId: entry._id, date, period, startTime: entry.startTime, endTime: entry.endTime, room: entry.room, courseId: timetable.courseId, departmentId: timetable.departmentId, sectionId: timetable.sectionId, subjectId: entry.subjectId, scheduledTeacher: entry.teacherId, substitution: substitute, submitted: submittedStatus, attendanceStatus: submittedStatus ? "Submitted" : "Pending", sessionId: submittedMap.get(String(entry._id)), attendanceOpen: availability.allowed, attendanceBlockedReason: availability.reason });
      });
    }
    return res.json(rows.sort((a, b) => a.startTime.localeCompare(b.startTime)));
  } catch (error) { return next(error); }
});

attendanceRouter.get("/class-summary", allowRoles("teacher"), async (req, res, next) => {
  try {
    const teacher = await currentTeacher(req);
    const assignment = await ClassTeacherAssignment.findOne({ tenantId: req.tenantId, teacherId: teacher?._id, courseId: req.query.courseId, departmentId: req.query.departmentId, sectionId: req.query.sectionId, isActive: true });
    if (!assignment) return res.status(403).json({ message: "Class teacher access required" });
    const students = await Student.find({ tenantId: req.tenantId, courseId: assignment.courseId, departmentId: assignment.departmentId, sectionId: assignment.sectionId, isActive: true }).select("name rollNumber").sort({ name: 1 }).lean();
    const sessions = await AttendanceSession.find({ tenantId: req.tenantId, courseId: assignment.courseId, departmentId: assignment.departmentId, sectionId: assignment.sectionId }).select("_id").lean();
    const records = await AttendanceRecord.find({ tenantId: req.tenantId, sessionId: { $in: sessions.map((session) => session._id) }, studentId: { $in: students.map((student) => student._id) } }).lean();
    const rows = students.map((student) => { const own = records.filter((record) => String(record.studentId) === String(student._id)); const present = own.filter((record) => ["present", "late"].includes(record.status)).length; return { ...student, total: own.length, present, percentage: own.length ? Math.round((present / own.length) * 10000) / 100 : 0 }; });
    const total = records.length; const present = records.filter((record) => ["present", "late"].includes(record.status)).length;
    return res.json({ students: rows, total, percentage: total ? Math.round((present / total) * 10000) / 100 : 0 });
  } catch (error) { return next(error); }
});

attendanceRouter.post("/sessions", allowRoles("teacher"), async (req, res, next) => {
  let session;
  try {
    const { timetableId, entryId, date, records, exceptionReason } = req.body;
    if (!mongoose.isValidObjectId(timetableId) || !mongoose.isValidObjectId(entryId) || !isValidAttendanceDate(date) || !Array.isArray(records) || !records.length)
      return res.status(400).json({ message: "Published timetable period, date, and attendance records are required" });
    if (records.some((record) => !mongoose.isValidObjectId(record.studentId) || !statuses.includes(record.status)) || new Set(records.map((record) => record.studentId)).size !== records.length)
      return res.status(400).json({ message: "Attendance contains invalid or duplicate students" });
    const teacher = await currentTeacher(req);
    const timetable = await Timetable.findOne({ _id: timetableId, tenantId: req.tenantId, status: "published" });
    const entry = timetable?.entries.id(entryId);
    if (!teacher || !entry || entry.type !== "period" || entry.day !== dayName(date)) return res.status(400).json({ message: "Attendance must match a published timetable period" });
    const availability = attendanceAvailability(date, entry.startTime);
    if (!availability.allowed) return res.status(409).json({ message: availability.reason });
    const scheduled = String(entry.teacherId) === String(teacher._id);
    const substitution = String(entry.substituteTeacherId) === String(teacher._id);
    if (!scheduled && !substitution) return res.status(403).json({ message: "You are not authorized for this timetable period" });
    if (substitution && !String(exceptionReason || "").trim()) return res.status(400).json({ message: "A substitution reason is required" });
    const studentCount = await Student.countDocuments({ _id: { $in: records.map((record) => record.studentId) }, tenantId: req.tenantId, courseId: timetable.courseId, departmentId: timetable.departmentId, sectionId: timetable.sectionId, isActive: true });
    if (studentCount !== records.length) return res.status(400).json({ message: "Students must belong to the timetable class and section" });
    const settings = await getOrCreateTimetableSettings(req.tenantId);
    const period = settings.timings.filter((timing) => timing.type === "period").findIndex((timing) => String(timing._id) === String(entry.timingId || "") || (timing.startTime === entry.startTime && timing.endTime === entry.endTime)) + 1;
    if (period < 1) return res.status(409).json({ message: "Timetable period no longer matches the college schedule" });
    session = await AttendanceSession.create({ tenantId: req.tenantId, timetableId, timetableEntryId: entry._id, courseId: timetable.courseId, departmentId: timetable.departmentId, sectionId: timetable.sectionId, subjectId: entry.subjectId, teacherId: teacher._id, scheduledTeacherId: entry.teacherId, date, period, startTime: entry.startTime, endTime: entry.endTime, exceptionReason: substitution ? exceptionReason.trim() : undefined });
    await AttendanceRecord.insertMany(records.map((record) => ({ tenantId: req.tenantId, sessionId: session._id, studentId: record.studentId, status: record.status })));
    const absentIds = records.filter((record) => record.status === "absent").map((record) => record.studentId);
    const links = await ParentStudentLink.find({ tenantId: req.tenantId, studentId: { $in: absentIds }, verified: true }).lean();
    const names = new Map((await Student.find({ tenantId: req.tenantId, _id: { $in: absentIds } }).select("name").lean()).map((student) => [String(student._id), student.name]));
    if (links.length) await Notification.bulkWrite(links.map((link) => ({ updateOne: { filter: { tenantId: req.tenantId, userId: link.parentUserId, dedupeKey: `absence:${session._id}:${link.studentId}` }, update: { $setOnInsert: { type: "absence", title: "Absence recorded", message: `${names.get(String(link.studentId))} was marked absent on ${date}, period ${period}.`, entityType: "AttendanceSession", entityId: session._id } }, upsert: true } })));
    return res.status(201).json({ session, recordCount: records.length, absenceAlerts: links.length });
  } catch (error) {
    if (session) { await AttendanceRecord.deleteMany({ sessionId: session._id }); await AttendanceSession.deleteOne({ _id: session._id }); }
    if (error?.code === 11000) return res.status(409).json({ message: "Attendance already submitted for this period" });
    return next(error);
  }
});

attendanceRouter.post("/sessions/:id/corrections", allowRoles("teacher"), async (req, res, next) => {
  try {
    const teacher = await currentTeacher(req);
    const session = await AttendanceSession.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!session || !(await teacherOwnsSession(req.tenantId, teacher, session))) return res.status(404).json({ message: "Attendance session not found" });
    const changes = req.body.changes;
    if (!String(req.body.reason || "").trim() || !Array.isArray(changes) || !changes.length || changes.some((change) => !mongoose.isValidObjectId(change.studentId) || !statuses.includes(change.status)) || new Set(changes.map((change) => String(change.studentId))).size !== changes.length)
      return res.status(400).json({ message: "Valid, unique correction changes and reason are required" });
    const recordCount = await AttendanceRecord.countDocuments({ tenantId: req.tenantId, sessionId: session._id, studentId: { $in: changes.map((change) => change.studentId) } });
    if (recordCount !== changes.length) return res.status(403).json({ message: "Corrections are limited to students in this attendance session" });
    if (await AttendanceCorrection.exists({ tenantId: req.tenantId, sessionId: session._id, status: "pending" })) return res.status(409).json({ message: "A correction request is already pending" });
    return res.status(201).json(await AttendanceCorrection.create({ tenantId: req.tenantId, sessionId: session._id, requestedBy: req.user.id, changes, reason: req.body.reason.trim() }));
  } catch (error) { return next(error); }
});

attendanceRouter.get("/sessions/:id", async (req, res, next) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!session) return res.status(404).json({ message: "Attendance session not found" });
    if (req.user.roles.includes("teacher")) {
      const teacher = await currentTeacher(req);
      if (!(await teacherOwnsSession(req.tenantId, teacher, session))) return res.status(403).json({ message: "Attendance session access denied" });
    } else if (!req.user.roles.includes("admin")) return res.status(403).json({ message: "Insufficient permissions" });
    return res.json({ session, records: await AttendanceRecord.find({ tenantId: req.tenantId, sessionId: session._id }).populate("studentId", "name rollNumber").lean() });
  } catch (error) { return next(error); }
});

attendanceRouter.get("/corrections", async (req, res, next) => {
  try {
    let filter = { tenantId: req.tenantId };
    if (req.user.roles.includes("teacher")) filter.requestedBy = req.user.id;
    else if (!req.user.roles.includes("admin")) return res.status(403).json({ message: "Insufficient permissions" });
    return res.json(await AttendanceCorrection.find(filter).populate("requestedBy", "name").populate({ path: "sessionId", populate: "courseId departmentId sectionId subjectId" }).populate("changes.studentId", "name rollNumber").sort({ createdAt: -1 }).lean());
  } catch (error) { return next(error); }
});

async function applyChange({ tenantId, sessionId, studentId, status, reason, actorId, correctionId }) {
  const record = await AttendanceRecord.findOne({ tenantId, sessionId, studentId });
  if (!record) throw new Error("Attendance record not found");
  if (record.status === status) return;
  await AttendanceAudit.create({ tenantId, sessionId, studentId, previousStatus: record.status, newStatus: status, reason, actorId, correctionId });
  record.status = status;
  await record.save();
}

attendanceRouter.patch("/corrections/:id", allowRoles("admin"), async (req, res, next) => {
  try {
    if (!["approved", "rejected"].includes(req.body.status) || !String(req.body.reason || "").trim()) return res.status(400).json({ message: "Decision and review reason are required" });
    const correction = await AttendanceCorrection.findOne({ _id: req.params.id, tenantId: req.tenantId, status: "pending" });
    if (!correction) return res.status(404).json({ message: "Pending correction request not found" });
    if (req.body.status === "approved") for (const change of correction.changes) await applyChange({ tenantId: req.tenantId, sessionId: correction.sessionId, studentId: change.studentId, status: change.status, reason: correction.reason, actorId: req.user.id, correctionId: correction._id });
    correction.status = req.body.status; correction.reviewedBy = req.user.id; correction.reviewReason = req.body.reason.trim(); correction.reviewedAt = new Date(); await correction.save();
    return res.json(correction);
  } catch (error) { return next(error); }
});

attendanceRouter.patch("/sessions/:sessionId/records/:studentId", allowRoles("admin"), async (req, res, next) => {
  try {
    if (!statuses.includes(req.body.status) || !String(req.body.reason || "").trim()) return res.status(400).json({ message: "Valid status and correction reason are required" });
    const session = await AttendanceSession.exists({ _id: req.params.sessionId, tenantId: req.tenantId });
    if (!session) return res.status(404).json({ message: "Attendance session not found" });
    await applyChange({ tenantId: req.tenantId, sessionId: req.params.sessionId, studentId: req.params.studentId, status: req.body.status, reason: req.body.reason.trim(), actorId: req.user.id });
    return res.json({ message: "Attendance corrected" });
  } catch (error) { return next(error); }
});

attendanceRouter.get("/reports", allowRoles("admin"), async (req, res, next) => {
  try {
    const sessionFilter = { tenantId: req.tenantId };
    if (req.query.from || req.query.to) sessionFilter.date = { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) };
    if (req.query.courseId) sessionFilter.courseId = req.query.courseId;
    if (req.query.departmentId) sessionFilter.departmentId = req.query.departmentId;
    if (req.query.sectionId) sessionFilter.sectionId = req.query.sectionId;
    const sessions = await AttendanceSession.find(sessionFilter).populate("courseId departmentId sectionId subjectId teacherId").lean();
    const recordFilter = { tenantId: req.tenantId, sessionId: { $in: sessions.map((session) => session._id) }, ...(req.query.studentId ? { studentId: req.query.studentId } : {}) };
    const records = await AttendanceRecord.find(recordFilter).populate("studentId", "name rollNumber").lean();
    const sessionMap = new Map(sessions.map((session) => [String(session._id), session]));
    const rows = records.map((record) => ({ ...record, session: sessionMap.get(String(record.sessionId)) }));
    const counts = Object.fromEntries(statuses.map((status) => [status, rows.filter((row) => row.status === status).length]));
    return res.json({ rows, total: rows.length, counts });
  } catch (error) { return next(error); }
});

attendanceRouter.get("/audits", allowRoles("admin"), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenantId, ...(req.query.sessionId ? { sessionId: req.query.sessionId } : {}), ...(req.query.studentId ? { studentId: req.query.studentId } : {}) };
    return res.json(await AttendanceAudit.find(filter).populate("studentId", "name rollNumber").populate("actorId", "name").sort({ createdAt: -1 }).lean());
  } catch (error) { return next(error); }
});

attendanceRouter.get("/calendar/:studentId", async (req, res, next) => {
  try {
    let allowed = req.user.roles.includes("admin") || req.user.roles.includes("teacher");
    if (req.user.roles.includes("parent")) allowed = Boolean(await ParentStudentLink.exists({ tenantId: req.tenantId, parentUserId: req.user.id, studentId: req.params.studentId, verified: true }));
    if (!allowed) return res.status(403).json({ message: "Student access denied" });
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || "")) ? String(req.query.month) : new Date().toISOString().slice(0, 7);
    const sessions = await AttendanceSession.find({ tenantId: req.tenantId, date: { $gte: `${month}-01`, $lte: `${month}-31` } }).select("date period subjectId").populate("subjectId", "name").lean();
    const records = await AttendanceRecord.find({ tenantId: req.tenantId, studentId: req.params.studentId, sessionId: { $in: sessions.map((session) => session._id) } }).lean();
    const sessionMap = new Map(sessions.map((session) => [String(session._id), session]));
    const days = records.map((record) => ({ ...record, session: sessionMap.get(String(record.sessionId)) }));
    const present = days.filter((row) => ["present", "late"].includes(row.status)).length;
    return res.json({ month, percentage: days.length ? Math.round((present / days.length) * 10000) / 100 : 0, days });
  } catch (error) { return next(error); }
});
