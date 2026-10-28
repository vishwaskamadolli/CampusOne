import { Router } from "express";
import mongoose from "mongoose";
import { allowRoles, requireAuth, requireTenant } from "../middleware/auth.js";
import {
  AttendanceRecord,
  AttendanceSession,
  AcademicYear,
  Course,
  Department,
  Event,
  Examination,
  Notification,
  ParentStudentLink,
  Result,
  Section,
  Student,
  Subject,
  StreamSubjectMapping,
  Teacher,
  TeacherAssignment,
  Timetable,
} from "../models/domain.models.js";
import { User } from "../models/user.model.js";
import { AuditLog } from "../models/audit-log.model.js";
import { ensureSimplifiedAcademicStructure } from "../services/academic-structure.js";

export const workflowsRouter = Router();
workflowsRouter.use(requireAuth, requireTenant);
workflowsRouter.use(async (req, _res, next) => { try { await ensureSimplifiedAcademicStructure(req.tenantId); next(); } catch (error) { next(error); } });
async function validExamStructure(body, tenantId) {
  if (![body.academicYearId, body.courseId, body.departmentId, body.sectionId].every(mongoose.isValidObjectId)) return false;
  const scoped = { tenantId, isActive: { $ne: false } };
  const refs = await Promise.all([
    AcademicYear.exists({ ...scoped, _id: body.academicYearId }),
    Course.exists({ ...scoped, _id: body.courseId }),
    Department.exists({ ...scoped, _id: body.departmentId }),
    Section.exists({ ...scoped, _id: body.sectionId, courseId: body.courseId, departmentId: body.departmentId }),
  ]);
  return refs.every(Boolean);
}
workflowsRouter.get("/attendance/sessions", async (req, res, next) => {
  try {
    let filter = { tenantId: req.tenantId };
    if (req.user.roles.includes("teacher")) {
      const t = await Teacher.findOne({
        tenantId: req.tenantId,
        userId: req.user.id,
      });
      filter.teacherId = t?._id ?? null;
    }
    return res.json(
      await AttendanceSession.find(filter)
        .populate("courseId departmentId sectionId subjectId teacherId")
        .sort({ date: -1, period: -1 })
        .lean(),
    );
  } catch (e) {
    next(e);
  }
});
workflowsRouter.post(
  "/attendance/sessions",
  allowRoles("teacher"),
  async (req, res, next) => {
    let session;
    try {
      const { assignmentId, date, period, records } = req.body;
      const teacher = await Teacher.findOne({
        tenantId: req.tenantId,
        userId: req.user.id,
        isActive: true,
      });
      const assignment =
        teacher &&
        (await TeacherAssignment.findOne({
          _id: assignmentId,
          tenantId: req.tenantId,
          teacherId: teacher._id,
          isActive: true,
        }));
      if (
        !assignment ||
        !date ||
        !Number.isInteger(period) ||
        !Array.isArray(records) ||
        !records.length
      )
        return res
          .status(400)
          .json({
            message: "Valid assignment, date, period, and records are required",
          });
      const ids = records.map((r) => r.studentId);
      const count = await Student.countDocuments({
        _id: { $in: ids },
        tenantId: req.tenantId,
        courseId: assignment.courseId,
        departmentId: assignment.departmentId,
        sectionId: assignment.sectionId,
        isActive: true,
      });
      if (count !== new Set(ids).size)
        return res
          .status(400)
          .json({
            message: "Attendance contains invalid or duplicate students",
          });
      session = await AttendanceSession.create({
        tenantId: req.tenantId,
        assignmentId,
        courseId: assignment.courseId,
        departmentId: assignment.departmentId,
        sectionId: assignment.sectionId,
        subjectId: assignment.subjectId,
        teacherId: teacher._id,
        date,
        period,
      });
      await AttendanceRecord.insertMany(
        records.map((r) => ({
          tenantId: req.tenantId,
          sessionId: session._id,
          studentId: r.studentId,
          status: r.status,
        })),
      );
      const absentIds = records
        .filter((r) => r.status === "absent")
        .map((r) => r.studentId);
      const links = await ParentStudentLink.find({
        tenantId: req.tenantId,
        studentId: { $in: absentIds },
        verified: true,
      }).lean();
      const students = await Student.find({ _id: { $in: absentIds } })
        .select("name")
        .lean();
      const names = new Map(students.map((s) => [String(s._id), s.name]));
      if (links.length)
        await Notification.bulkWrite(
          links.map((link) => ({
            updateOne: {
              filter: {
                tenantId: req.tenantId,
                userId: link.parentUserId,
                dedupeKey: `absence:${session._id}:${link.studentId}`,
              },
              update: {
                $setOnInsert: {
                  type: "absence",
                  title: "Absence recorded",
                  message: `${names.get(String(link.studentId))} was marked absent on ${date}, period ${period}.`,
                  entityType: "AttendanceSession",
                  entityId: session._id,
                },
              },
              upsert: true,
            },
          })),
        );
      return res
        .status(201)
        .json({
          session,
          recordCount: records.length,
          absenceAlerts: links.length,
        });
    } catch (e) {
      if (session) await AttendanceSession.deleteOne({ _id: session._id });
      if (e?.code === 11000)
        return res
          .status(409)
          .json({ message: "Attendance already submitted for this period" });
      next(e);
    }
  },
);
workflowsRouter.get(
  "/attendance/summary/:studentId",
  async (req, res, next) => {
    try {
      let allowed =
        req.user.roles.includes("admin") || req.user.roles.includes("teacher");
      if (req.user.roles.includes("parent"))
        allowed = Boolean(
          await ParentStudentLink.exists({
            tenantId: req.tenantId,
            parentUserId: req.user.id,
            studentId: req.params.studentId,
            verified: true,
          }),
        );
      if (!allowed)
        return res.status(403).json({ message: "Student access denied" });
      const rows = await AttendanceRecord.aggregate([
        {
          $match: {
            tenantId: new mongoose.Types.ObjectId(req.tenantId),
            studentId: new mongoose.Types.ObjectId(req.params.studentId),
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      const total = rows.reduce((n, r) => n + r.count, 0);
      const present = rows
        .filter((r) => ["present", "late"].includes(r._id))
        .reduce((n, r) => n + r.count, 0);
      return res.json({
        total,
        present,
        percentage: total ? Math.round((present / total) * 10000) / 100 : 0,
        breakdown: Object.fromEntries(rows.map((r) => [r._id, r.count])),
      });
    } catch (e) {
      next(e);
    }
  },
);
workflowsRouter.get("/examinations", async (req, res, next) => {
  try {
    let filter = { tenantId: req.tenantId };
    if (req.user.roles.includes("parent")) {
      const childIds = await ParentStudentLink.find({ tenantId: req.tenantId, parentUserId: req.user.id, verified: true }).distinct("studentId");
      const children = await Student.find({ tenantId: req.tenantId, _id: { $in: childIds } }).select("courseId departmentId sectionId").lean();
      filter = { ...filter, timetableStatus: "published", $or: children.map((child) => ({ courseId: child.courseId, departmentId: child.departmentId, sectionId: child.sectionId })) };
    } else if (req.user.roles.includes("teacher")) {
      const teacher = await Teacher.findOne({ tenantId: req.tenantId, userId: req.user.id, isActive: true });
      const timetables = await Timetable.find({ tenantId: req.tenantId, status: "published", $or: [{ "entries.teacherId": teacher?._id }, { "entries.substituteTeacherId": teacher?._id }] }).select("courseId departmentId sectionId entries").lean();
      const clauses = timetables.map((timetable) => ({ courseId: timetable.courseId, departmentId: timetable.departmentId, sectionId: timetable.sectionId, "timetableEntries.subjectId": { $in: timetable.entries.filter((entry) => String(entry.teacherId) === String(teacher?._id) || String(entry.substituteTeacherId) === String(teacher?._id)).map((entry) => entry.subjectId) } }));
      filter = { ...filter, timetableStatus: "published", $or: clauses };
    } else if (!req.user.roles.includes("admin")) return res.status(403).json({ message: "Insufficient permissions" });
    return res.json(
      await Examination.find(filter)
        .populate("courseId departmentId academicYearId sectionId", "name")
        .populate("timetableEntries.subjectId", "name code")
        .sort({ startDate: -1 })
        .lean(),
    );
  } catch (e) {
    next(e);
  }
});
workflowsRouter.post(
  "/examinations",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      if (!(await validExamStructure(req.body, req.tenantId)))
        return res.status(400).json({ message: "Academic year, class, and stream are required" });
      return res
        .status(201)
        .json(
          await Examination.create({ ...req.body, classId: undefined, tenantId: req.tenantId, timetableStatus: "draft" }),
        );
    } catch (e) {
      next(e);
    }
  },
);
workflowsRouter.patch(
  "/examinations/:id",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const { tenantId: _tenantId, classId: _legacyClassId, ...changes } = req.body;
      if (changes.status === "published") return res.status(400).json({ message: "Publish examination results through the result import workflow" });
      const existing = await Examination.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
      if (!existing) return res.status(404).json({ message: "Examination not found" });
      if (!(await validExamStructure({ ...existing, ...changes }, req.tenantId)))
        return res.status(400).json({ message: "Academic year, class, and stream are required" });
      const exam = await Examination.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId },
        { $set: changes },
        { new: true, runValidators: true },
      );
      if (!exam)
        return res.status(404).json({ message: "Examination not found" });
      if (changes.status === "published") {
        await Result.updateMany(
          { tenantId: req.tenantId, examinationId: exam._id },
          { $set: { approved: true } },
        );
        const studentIds = await Result.find({
          tenantId: req.tenantId,
          examinationId: exam._id,
        }).distinct("studentId");
        const links = await ParentStudentLink.find({
          tenantId: req.tenantId,
          studentId: { $in: studentIds },
          verified: true,
        });
        if (links.length)
          await Notification.bulkWrite(
            links.map((l) => ({
              updateOne: {
                filter: {
                  tenantId: req.tenantId,
                  userId: l.parentUserId,
                  dedupeKey: `result:${exam._id}:${l.studentId}`,
                },
                update: {
                  $setOnInsert: {
                    type: "result",
                    title: "Results published",
                    message: `${exam.name} results are available.`,
                    entityType: "Examination",
                    entityId: exam._id,
                  },
                },
                upsert: true,
              },
            })),
          );
      }
      return res.json(exam);
    } catch (e) {
      next(e);
    }
  },
);

async function validateExamTimetableEntry(exam, entry, tenantId, excludeId) {
  if (!mongoose.isValidObjectId(entry.subjectId)) return "A mapped subject is required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || "")) || Number.isNaN(Date.parse(`${entry.date}T00:00:00Z`))) return "A valid examination date is required";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startTime || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.endTime || "") || entry.startTime >= entry.endTime) return "Valid start and end times are required";
  const maxMarks = Number(entry.maxMarks);
  if (!Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 1000) return "Maximum marks must be between 1 and 1000";
  const examDate = new Date(`${entry.date}T00:00:00Z`);
  if (examDate < new Date(exam.startDate.toISOString().slice(0, 10)) || examDate > new Date(exam.endDate.toISOString().slice(0, 10))) return "Timetable date must be within the examination dates";
  const mapped = await StreamSubjectMapping.exists({ tenantId, streamId: exam.departmentId, subjectId: entry.subjectId, isActive: true });
  if (!mapped) return "Subject is not mapped to the examination stream";
  const others = exam.timetableEntries.filter((item) => String(item._id) !== String(excludeId || ""));
  if (others.some((item) => String(item.subjectId) === String(entry.subjectId))) return "Each subject can appear only once in an examination timetable";
  if (others.some((item) => item.date.toISOString().slice(0, 10) === entry.date && item.startTime < entry.endTime && entry.startTime < item.endTime)) return "Examination timetable entries cannot overlap";
  return null;
}

async function previewExamCreation(body, tenantId) {
  const errors = [];
  if (!String(body.name || "").trim()) errors.push({ row: 0, message: "Examination name is required" });
  if (!(await validExamStructure(body, tenantId))) errors.push({ row: 0, message: "Academic year, class, stream, and section are required" });
  const startDate = new Date(`${body.startDate}T00:00:00Z`), endDate = new Date(`${body.endDate}T00:00:00Z`);
  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf()) || startDate > endDate) errors.push({ row: 0, message: "Valid examination start and end dates are required" });
  const mappings = await StreamSubjectMapping.find({ tenantId, streamId: body.departmentId, isActive: true }).populate("subjectId", "name code").lean();
  const subjectLookup = new Map();
  for (const mapping of mappings) { subjectLookup.set(String(mapping.subjectId.code).toUpperCase(), mapping.subjectId); subjectLookup.set(String(mapping.subjectId.name).toUpperCase(), mapping.subjectId); }
  const exam = { startDate, endDate, departmentId: body.departmentId, timetableEntries: [] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) errors.push({ row: 0, message: "Upload at least one timetable entry" });
  for (const [index, row] of rows.entries()) {
    const subject = subjectLookup.get(String(row.subject || "").trim().toUpperCase());
    if (!subject) { errors.push({ row: index + 2, field: "subject", message: `Subject ${row.subject || "is missing"} is not mapped to the selected stream` }); continue; }
    const normalized = { subjectId: subject._id, subjectName: subject.name, subjectCode: subject.code, date: String(row.date || "").slice(0, 10), startTime: String(row.startTime || ""), endTime: String(row.endTime || ""), maxMarks: Number(row.maxMarks) };
    const error = await validateExamTimetableEntry(exam, normalized, tenantId);
    if (error) errors.push({ row: index + 2, message: error });
    else exam.timetableEntries.push({ ...normalized, date: new Date(`${normalized.date}T00:00:00Z`) });
  }
  return { errors, entries: exam.timetableEntries.map((entry) => ({ ...entry, date: entry.date.toISOString().slice(0, 10) })), subjects: mappings.map((mapping) => mapping.subjectId) };
}

workflowsRouter.post("/examinations/timetable-template", allowRoles("admin"), async (req, res, next) => {
  try {
    if (!(await validExamStructure(req.body, req.tenantId))) return res.status(400).json({ message: "Select academic year, class, stream, and section first" });
    const mappings = await StreamSubjectMapping.find({ tenantId: req.tenantId, streamId: req.body.departmentId, isActive: true }).populate("subjectId", "name code").lean();
    return res.json({ rows: mappings.map((mapping) => ({ subject: mapping.subjectId.code, date: "", startTime: "", endTime: "", maxMarks: "" })) });
  } catch (error) { return next(error); }
});

workflowsRouter.post("/examinations/timetable-preview", allowRoles("admin"), async (req, res, next) => {
  try { const preview = await previewExamCreation(req.body, req.tenantId); return res.json({ errors: preview.errors, entries: preview.entries }); }
  catch (error) { return next(error); }
});

workflowsRouter.post("/examinations/with-timetable", allowRoles("admin"), async (req, res, next) => {
  try {
    const preview = await previewExamCreation(req.body, req.tenantId);
    if (preview.errors.length) return res.status(400).json({ message: "Resolve timetable errors before saving", errors: preview.errors });
    const duplicate = await Examination.exists({ tenantId: req.tenantId, name: { $regex: `^${String(req.body.name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }, academicYearId: req.body.academicYearId, courseId: req.body.courseId, departmentId: req.body.departmentId, sectionId: req.body.sectionId });
    if (duplicate) return res.status(409).json({ message: "This examination already exists for the selected section" });
    const exam = await Examination.create({ tenantId: req.tenantId, name: req.body.name.trim(), academicYearId: req.body.academicYearId, courseId: req.body.courseId, departmentId: req.body.departmentId, sectionId: req.body.sectionId, startDate: req.body.startDate, endDate: req.body.endDate, timetableEntries: preview.entries, timetableStatus: "published", timetablePublishedAt: new Date(), status: "draft" });
    await AuditLog.create({ tenantId: req.tenantId, actorId: req.user.id, action: "examination.created", entityType: "Examination", entityId: exam._id, metadata: { timetableEntries: preview.entries.length }, ipAddress: req.ip });
    return res.status(201).json(await exam.populate("timetableEntries.subjectId", "name code"));
  } catch (error) { return next(error); }
});

workflowsRouter.post("/examinations/:id/timetable", allowRoles("admin"), async (req, res, next) => {
  try {
    const exam = await Examination.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!exam) return res.status(404).json({ message: "Examination not found" });
    const error = await validateExamTimetableEntry(exam, req.body, req.tenantId);
    if (error) return res.status(400).json({ message: error });
    exam.timetableEntries.push(req.body); exam.timetableStatus = "published"; exam.timetablePublishedAt = new Date(); await exam.save();
    return res.status(201).json(await exam.populate("timetableEntries.subjectId", "name code"));
  } catch (error) { return next(error); }
});

workflowsRouter.patch("/examinations/:id/timetable/:entryId", allowRoles("admin"), async (req, res, next) => {
  try {
    const exam = await Examination.findOne({ _id: req.params.id, tenantId: req.tenantId });
    const entry = exam?.timetableEntries.id(req.params.entryId);
    if (!exam || !entry) return res.status(404).json({ message: "Examination timetable entry not found" });
    const changes = { subjectId: req.body.subjectId ?? entry.subjectId, date: req.body.date ?? entry.date.toISOString().slice(0, 10), startTime: req.body.startTime ?? entry.startTime, endTime: req.body.endTime ?? entry.endTime, maxMarks: req.body.maxMarks ?? entry.maxMarks };
    const error = await validateExamTimetableEntry(exam, changes, req.tenantId, entry._id);
    if (error) return res.status(400).json({ message: error });
    Object.assign(entry, changes); exam.timetableStatus = "published"; exam.timetablePublishedAt = new Date(); await exam.save();
    return res.json(await exam.populate("timetableEntries.subjectId", "name code"));
  } catch (error) { return next(error); }
});

workflowsRouter.delete("/examinations/:id/timetable/:entryId", allowRoles("admin"), async (req, res, next) => {
  try {
    const exam = await Examination.findOne({ _id: req.params.id, tenantId: req.tenantId });
    const entry = exam?.timetableEntries.id(req.params.entryId);
    if (!exam || !entry) return res.status(404).json({ message: "Examination timetable entry not found" });
    entry.deleteOne(); exam.timetableStatus = "published"; exam.timetablePublishedAt = new Date(); await exam.save();
    return res.json(exam);
  } catch (error) { return next(error); }
});

workflowsRouter.patch("/examinations/:id/publish-timetable", allowRoles("admin"), async (req, res, next) => {
  try {
    const exam = await Examination.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!exam) return res.status(404).json({ message: "Examination not found" });
    if (!exam.timetableEntries.length) return res.status(400).json({ message: "Add at least one timetable entry before publishing" });
    exam.timetableStatus = "published"; exam.timetablePublishedAt = new Date(); await exam.save();
    await AuditLog.create({ tenantId: req.tenantId, actorId: req.user.id, action: "examination.timetable.published", entityType: "Examination", entityId: exam._id, metadata: { entries: exam.timetableEntries.length }, ipAddress: req.ip });
    return res.json(exam);
  } catch (error) { return next(error); }
});
workflowsRouter.post(
  "/results",
  allowRoles("admin"),
  async (req, res, next) => {
    if (req.originalUrl.endsWith("/results")) return res.status(405).json({ message: "Manual result entry is disabled; use the admin result import workflow" });
    try {
      const rows = Array.isArray(req.body.rows) ? req.body.rows : [req.body];
      if (req.user.roles.includes("teacher")) {
        const teacher = await Teacher.findOne({
          tenantId: req.tenantId,
          userId: req.user.id,
          isActive: true,
        });
        const timetables = await Timetable.find({
          tenantId: req.tenantId,
          status: "published",
          "entries.teacherId": teacher?._id,
        }).select("entries").lean();
        const allowed = timetables.flatMap((timetable) => timetable.entries.filter((entry) => String(entry.teacherId) === String(teacher?._id)).map((entry) => entry.subjectId));
        if (
          rows.some(
            (r) => !allowed.some((id) => String(id) === String(r.subjectId)),
          )
        )
          return res
            .status(403)
            .json({
              message: "Marks can only be entered for assigned subjects",
            });
      }
      await Result.bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: {
              tenantId: req.tenantId,
              examinationId: row.examinationId,
              studentId: row.studentId,
              subjectId: row.subjectId,
            },
            update: {
              $set: {
                marks: row.marks,
                maxMarks: row.maxMarks,
                grade: row.grade,
                enteredBy: req.user.id,
                approved: false,
              },
            },
            upsert: true,
          },
        })),
      );
      return res.status(201).json({ saved: rows.length });
    } catch (e) {
      next(e);
    }
  },
);

async function resultImportContext(body, tenantId) {
  const required = ["academicYearId", "examinationId", "courseId", "departmentId", "sectionId"];
  if (required.some((key) => !mongoose.isValidObjectId(body[key]))) return { error: "Academic year, examination, class, stream, and section are required" };
  const [exam, section, mappings, students] = await Promise.all([
    Examination.findOne({ _id: body.examinationId, tenantId, academicYearId: body.academicYearId, courseId: body.courseId, departmentId: body.departmentId, $or: [{ sectionId: body.sectionId }, { sectionId: null }] }),
    Section.findOne({ _id: body.sectionId, tenantId, courseId: body.courseId, departmentId: body.departmentId, isActive: { $ne: false } }),
    StreamSubjectMapping.find({ tenantId, streamId: body.departmentId, isActive: true }).populate("subjectId", "name code").lean(),
    Student.find({ tenantId, courseId: body.courseId, departmentId: body.departmentId, sectionId: body.sectionId, isActive: true }).select("name admissionNumber").sort({ admissionNumber: 1 }).lean(),
  ]);
  if (!exam || !section) return { error: "The selected examination and section do not match the academic structure" };
  let subjects = mappings.map((mapping) => mapping.subjectId).filter(Boolean);
  if (exam.timetableEntries?.length) {
    const mappedById = new Map(subjects.map((subject) => [String(subject._id), subject]));
    subjects = exam.timetableEntries.map((entry) => {
      const subject = mappedById.get(String(entry.subjectId));
      return subject ? { ...subject, maxMarks: entry.maxMarks } : null;
    }).filter(Boolean);
  }
  if (!subjects.length) return { error: "No subjects are mapped to the selected stream" };
  return { exam, section, subjects, students };
}

async function previewResultImport(body, tenantId) {
  const context = await resultImportContext(body, tenantId);
  if (context.error) return { ...context, errors: [{ row: 0, message: context.error }], validRows: [] };
  const maxMarks = Number(body.maxMarks);
  const errors = [];
  if (!Number.isFinite(maxMarks) || !Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 1000)
    errors.push({ row: 0, field: "maxMarks", message: "Maximum marks must be a whole number between 1 and 1000" });
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) errors.push({ row: 0, message: "The uploaded file contains no student rows" });
  const studentsByAdmission = new Map(context.students.map((student) => [student.admissionNumber.toUpperCase(), student]));
  const subjectsByCode = new Map(context.subjects.map((subject) => [subject.code.toUpperCase(), subject]));
  const seen = new Set();
  const imported = new Set();
  const validRows = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const admissionNumber = String(row.admissionNumber || "").trim().toUpperCase();
    if (!admissionNumber) { errors.push({ row: rowNumber, field: "admissionNumber", message: "Admission number is required" }); return; }
    if (seen.has(admissionNumber)) { errors.push({ row: rowNumber, field: "admissionNumber", message: `Duplicate admission number ${admissionNumber}` }); return; }
    seen.add(admissionNumber);
    const student = studentsByAdmission.get(admissionNumber);
    if (!student) { errors.push({ row: rowNumber, field: "admissionNumber", message: `Student ${admissionNumber} was not found in the selected section` }); return; }
    imported.add(admissionNumber);
    const marks = row.marks && typeof row.marks === "object" ? row.marks : {};
    for (const code of Object.keys(marks)) if (!subjectsByCode.has(code.toUpperCase()))
      errors.push({ row: rowNumber, field: code, message: `Subject ${code} is not mapped to the selected stream` });
    for (const [code, subject] of subjectsByCode) {
      const raw = marks[code] ?? marks[code.toLowerCase()];
      if (raw === "" || raw === null || raw === undefined) { errors.push({ row: rowNumber, field: code, message: `${code} marks are required` }); continue; }
      const subjectMaxMarks = Number(subject.maxMarks || maxMarks);
      const mark = Number(raw);
      if (!Number.isFinite(mark) || mark < 0 || mark > subjectMaxMarks) { errors.push({ row: rowNumber, field: code, message: `${code} marks must be between 0 and ${subjectMaxMarks}` }); continue; }
      validRows.push({ studentId: student._id, studentName: student.name, admissionNumber, subjectId: subject._id, subjectCode: code, marks: mark, maxMarks: subjectMaxMarks });
    }
  });
  for (const student of context.students) if (!imported.has(student.admissionNumber.toUpperCase()))
    errors.push({ row: 0, field: "admissionNumber", message: `Missing student ${student.admissionNumber} (${student.name})` });
  return { ...context, maxMarks, errors, validRows, studentCount: context.students.length, resultCount: validRows.length };
}

workflowsRouter.post("/results/import-template", allowRoles("admin"), async (req, res, next) => {
  try {
    const context = await resultImportContext(req.body, req.tenantId);
    if (context.error) return res.status(400).json({ message: context.error });
    return res.json({ subjects: context.subjects.map(({ _id, name, code, maxMarks }) => ({ _id, name, code, maxMarks })), rows: context.students.map((student) => ({ admissionNumber: student.admissionNumber, studentName: student.name })) });
  } catch (error) { return next(error); }
});

workflowsRouter.post("/results/import-preview", allowRoles("admin"), async (req, res, next) => {
  try {
    const preview = await previewResultImport(req.body, req.tenantId);
    return res.status(preview.error ? 400 : 200).json({ errors: preview.errors, validRows: preview.validRows, studentCount: preview.studentCount || 0, resultCount: preview.resultCount || 0 });
  } catch (error) { return next(error); }
});

workflowsRouter.post("/results/import", allowRoles("admin"), async (req, res, next) => {
  try {
    const preview = await previewResultImport(req.body, req.tenantId);
    if (preview.errors.length) return res.status(400).json({ message: "Resolve import errors before saving", errors: preview.errors });
    const existing = await Result.find({ tenantId: req.tenantId, examinationId: preview.exam._id, studentId: { $in: preview.validRows.map((row) => row.studentId) } }).lean();
    await Result.bulkWrite(preview.validRows.map((row) => ({ updateOne: {
      filter: { tenantId: req.tenantId, examinationId: preview.exam._id, studentId: row.studentId, subjectId: row.subjectId },
      update: { $set: { marks: row.marks, maxMarks: row.maxMarks, enteredBy: req.user.id, approved: false } }, upsert: true,
    } })));
    await Result.updateMany({ tenantId: req.tenantId, examinationId: preview.exam._id }, { $set: { approved: false } });
    preview.exam.status = "review";
    await preview.exam.save();
    await AuditLog.create({ tenantId: req.tenantId, actorId: req.user.id, action: existing.length ? "results.corrected" : "results.imported", entityType: "Examination", entityId: preview.exam._id, metadata: { sectionId: req.body.sectionId, rows: preview.validRows.length, previousResults: existing.map(({ studentId, subjectId, marks, maxMarks }) => ({ studentId, subjectId, marks, maxMarks })) }, ipAddress: req.ip });
    return res.status(201).json({ saved: preview.validRows.length, status: "review" });
  } catch (error) { return next(error); }
});

workflowsRouter.patch("/examinations/:id/publish-results", allowRoles("admin"), async (req, res, next) => {
  try {
    const exam = await Examination.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!exam) return res.status(404).json({ message: "Examination not found" });
    const resultCount = await Result.countDocuments({ tenantId: req.tenantId, examinationId: exam._id });
    if (!resultCount) return res.status(400).json({ message: "Import results before publishing" });
    await Result.updateMany({ tenantId: req.tenantId, examinationId: exam._id }, { $set: { approved: true } });
    exam.status = "published"; await exam.save();
    await AuditLog.create({ tenantId: req.tenantId, actorId: req.user.id, action: "results.published", entityType: "Examination", entityId: exam._id, metadata: { resultCount }, ipAddress: req.ip });
    return res.json({ examination: exam, published: resultCount });
  } catch (error) { return next(error); }
});
workflowsRouter.get("/results", async (req, res, next) => {
  try {
    if (req.user.roles.includes("teacher")) return res.status(403).json({ message: "Result access is limited to administrators and parents" });
    let filter = { tenantId: req.tenantId };
    if (req.user.roles.includes("parent")) {
      const children = await ParentStudentLink.find({
        tenantId: req.tenantId,
        parentUserId: req.user.id,
        verified: true,
      }).distinct("studentId");
      const published = await Examination.find({
        tenantId: req.tenantId,
        status: "published",
      }).distinct("_id");
      filter = {
        ...filter,
        studentId: { $in: children },
        examinationId: { $in: published },
        approved: true,
      };
    }
    const rows = await Result.find(filter)
        .populate("studentId", "name rollNumber")
        .populate("subjectId", "name code")
        .populate("examinationId", "name status")
        .sort({ createdAt: -1 })
        .lean();
    if (!req.user.roles.includes("parent")) return res.json(rows);
    const totals = new Map();
    for (const row of rows) {
      const key = `${row.studentId?._id}:${row.examinationId?._id}`;
      const total = totals.get(key) || { marks: 0, maxMarks: 0 };
      total.marks += row.marks; total.maxMarks += row.maxMarks; totals.set(key, total);
    }
    return res.json(rows.map((row) => { const total = totals.get(`${row.studentId?._id}:${row.examinationId?._id}`); return { ...row, totalMarks: total.marks, totalMaxMarks: total.maxMarks, percentage: total.maxMarks ? Math.round((total.marks / total.maxMarks) * 10000) / 100 : 0 }; }));
  } catch (e) {
    next(e);
  }
});
workflowsRouter.get("/events", async (req, res, next) => {
  try {
    return res.json(
      await Event.find({
        tenantId: req.tenantId,
        ...(req.user.roles.includes("parent") ? { status: "published" } : {}),
      })
        .sort({ startsAt: 1 })
        .lean(),
    );
  } catch (e) {
    next(e);
  }
});
workflowsRouter.post("/events", allowRoles("admin"), async (req, res, next) => {
  try {
    return res
      .status(201)
      .json(await Event.create({ ...req.body, tenantId: req.tenantId }));
  } catch (e) {
    next(e);
  }
});
workflowsRouter.patch(
  "/events/:id",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const event = await Event.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId },
        {
          $set: {
            ...req.body,
            ...(req.body.status === "published"
              ? { publishedAt: new Date() }
              : {}),
          },
        },
        { new: true, runValidators: true },
      );
      if (!event) return res.status(404).json({ message: "Event not found" });
      if (req.body.status === "published") {
        let parentIds;
        if (event.targetAllParents)
          parentIds = await User.find({
            tenantId: req.tenantId,
            roles: "parent",
            isActive: true,
          }).distinct("_id");
        else {
          const students = await Student.find({
            tenantId: req.tenantId,
            classId: { $in: event.targetClassIds },
          }).distinct("_id");
          parentIds = await ParentStudentLink.find({
            tenantId: req.tenantId,
            studentId: { $in: students },
            verified: true,
          }).distinct("parentUserId");
        }
        if (parentIds.length)
          await Notification.bulkWrite(
            parentIds.map((id) => ({
              updateOne: {
                filter: {
                  tenantId: req.tenantId,
                  userId: id,
                  dedupeKey: `event:${event._id}`,
                },
                update: {
                  $setOnInsert: {
                    type: "event",
                    title: event.title,
                    message: event.description,
                    entityType: "Event",
                    entityId: event._id,
                  },
                },
                upsert: true,
              },
            })),
          );
      }
      return res.json(event);
    } catch (e) {
      next(e);
    }
  },
);
workflowsRouter.delete(
  "/events/:id",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const result = await Event.deleteOne({
        _id: req.params.id,
        tenantId: req.tenantId,
        status: "draft",
      });
      return res.json({ success: result.deletedCount === 1 });
    } catch (e) {
      next(e);
    }
  },
);
workflowsRouter.get("/notifications", async (req, res, next) => {
  try {
    return res.json(
      await Notification.find({ tenantId: req.tenantId, userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    );
  } catch (e) {
    next(e);
  }
});
workflowsRouter.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    return res.json(
      await Notification.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId, userId: req.user.id },
        { $set: { readAt: new Date() } },
        { new: true },
      ),
    );
  } catch (e) {
    next(e);
  }
});
