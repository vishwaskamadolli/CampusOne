import { Router } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { allowRoles, requireAuth, requireTenant } from "../middleware/auth.js";
import {
  ClassTeacherAssignment,
  Course,
  Department,
  ParentStudentLink,
  Student,
  StreamSubjectMapping,
  Subject,
  Section,
  Teacher,
  TeacherAssignment,
  Timetable,
} from "../models/domain.models.js";
import { ensureSimplifiedAcademicStructure, validateSectionStructure } from "../services/academic-structure.js";
import { User } from "../models/user.model.js";
import { deliverParentInvitation, deliverTeacherInvitation, generateTemporaryPassword } from "../services/credential-delivery.js";

export const peopleRouter = Router();
peopleRouter.use(requireAuth, requireTenant);
peopleRouter.use(async (req, _res, next) => { try { await ensureSimplifiedAcademicStructure(req.tenantId); next(); } catch (error) { next(error); } });

const validEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || "").trim());
const validPhone = (value) => /^\+?[1-9]\d{9,14}$/.test(String(value || "").replace(/[\s-]/g, ""));
async function validateParentStudents(studentIds, tenantId) {
  if (!Array.isArray(studentIds) || !studentIds.length) return null;
  const ids = [...new Set(studentIds.map(String))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) return null;
  return await Student.countDocuments({ _id: { $in: ids }, tenantId, isActive: true }) === ids.length ? ids : null;
}
async function deliverParentCredentials(user, temporaryPassword) {
  const delivery = await deliverParentInvitation({ name: user.name, email: user.email, phone: user.phone, temporaryPassword });
  user.credentialDeliveryStatus = delivery.status;
  user.credentialDeliveryChannel = delivery.channel || undefined;
  user.credentialDeliveryLastAttemptAt = new Date();
  if (delivery.status === "delivered") user.credentialDeliveredAt = new Date();
  await user.save();
  return delivery;
}

async function validateStudentStructure(body, tenantId) {
  if (![body.courseId, body.departmentId, body.sectionId].every(mongoose.isValidObjectId)) return false;
  return Boolean(await validateSectionStructure({ tenantId, courseId: body.courseId, departmentId: body.departmentId, sectionId: body.sectionId }));
}

async function validateTeachingSubjects(value, tenantId, departmentId) {
  if (value === undefined) return undefined;
  const invalid = (message) => {
    const error = new mongoose.Error.ValidationError();
    error.addError("teachingSubjectIds", new mongoose.Error.ValidatorError({ message }));
    throw error;
  };
  if (!Array.isArray(value)) invalid("Teaching subjects must be a list");
  const ids = [...new Set(value.filter(Boolean).map(String))];
  if (ids.some((id) => !mongoose.isValidObjectId(id)))
    invalid("One or more teaching subjects are invalid");
  const count = await Subject.countDocuments({ _id: { $in: ids }, tenantId, isActive: { $ne: false } });
  if (count !== ids.length)
    invalid("One or more teaching subjects are unavailable");
  if (departmentId && ids.length) {
    const mapped = await StreamSubjectMapping.countDocuments({ tenantId, streamId: departmentId, subjectId: { $in: ids }, isActive: true });
    if (mapped !== ids.length) invalid("One or more teaching subjects are not mapped to the selected stream");
  }
  return ids;
}
export function teacherCreationResponse(teacher, delivery) {
  return { teacher, notification: { status: delivery.status, channel: delivery.channel } };
}
peopleRouter.get("/teachers", allowRoles("admin"), async (req, res, next) => {
  try {
    const q = req.query.q
      ? { $regex: String(req.query.q), $options: "i" }
      : undefined;
    const filter = {
      tenantId: req.tenantId,
      ...(q ? { $or: [{ employeeNumber: q }] } : {}),
    };
    return res.json(
      await Teacher.find(filter)
        .populate("userId", "name email isActive mustChangePassword credentialDeliveryStatus credentialDeliveryChannel credentialDeliveryLastAttemptAt")
        .populate("departmentId", "name code")
        .populate("teachingSubjectIds", "name code")
        .sort({ createdAt: -1 })
        .lean(),
    );
  } catch (e) {
    next(e);
  }
});
peopleRouter.post("/teachers", allowRoles("admin"), async (req, res, next) => {
  try {
    const { name, email, employeeNumber, departmentId, phone, qualification, teachingSubjectIds, createLoginAccount } =
      req.body;
    if (
      !name ||
      !email ||
      !employeeNumber ||
      !mongoose.isValidObjectId(departmentId)
    )
      return res
        .status(400)
        .json({
          message: "Name, email, employee number, and department are required",
        });
    if (createLoginAccount !== true)
      return res.status(400).json({ message: "A teacher login account is required" });
    const normalizedEmail = String(email).trim().toLowerCase();
    const duplicate = await Promise.all([
      User.exists({ tenantId: req.tenantId, email: normalizedEmail }),
      Teacher.exists({ tenantId: req.tenantId, employeeNumber: String(employeeNumber).trim().toUpperCase() }),
    ]);
    if (duplicate.some(Boolean))
      return res.status(409).json({ message: "A teacher or login account with these details already exists" });
    const subjects = await validateTeachingSubjects(teachingSubjectIds || [], req.tenantId, departmentId);
    const temporaryPassword = generateTemporaryPassword();
    const user = await User.create({
      tenantId: req.tenantId,
      name,
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      roles: ["teacher"],
      mustChangePassword: true,
      credentialDeliveryStatus: "pending",
    });
    const teacher = await Teacher.create({
      tenantId: req.tenantId,
      userId: user._id,
      employeeNumber,
      departmentId,
      phone,
      qualification,
      teachingSubjectIds: subjects,
    });
    const populated = await teacher.populate([
      { path: "userId", select: "name email isActive mustChangePassword credentialDeliveryStatus credentialDeliveryChannel credentialDeliveryLastAttemptAt" },
      { path: "departmentId", select: "name code" },
      { path: "teachingSubjectIds", select: "name code" },
    ]);
    const delivery = await deliverTeacherInvitation({ name, email: normalizedEmail, phone, temporaryPassword });
    await User.updateOne({ _id: user._id, tenantId: req.tenantId }, { $set: {
      credentialDeliveryStatus: delivery.status,
      credentialDeliveryChannel: delivery.channel || undefined,
      credentialDeliveryLastAttemptAt: new Date(),
      ...(delivery.status === "delivered" ? { credentialDeliveredAt: new Date() } : {}),
    } });
    return res.status(201).json(teacherCreationResponse(populated.toObject(), delivery));
  } catch (e) {
    next(e);
  }
});
peopleRouter.patch(
  "/teachers/:id",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const { name, email, teachingSubjectIds } = req.body;
      const current = await Teacher.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
      if (!current) return res.status(404).json({ message: "Teacher not found" });
      const profile = Object.fromEntries(["employeeNumber", "departmentId", "phone", "qualification"].filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
      const subjects = await validateTeachingSubjects(teachingSubjectIds, req.tenantId, profile.departmentId || current.departmentId);
      if (subjects !== undefined) profile.teachingSubjectIds = subjects;
      const normalizedEmail = email === undefined ? undefined : String(email).trim().toLowerCase();
      if (normalizedEmail && (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || await User.exists({ tenantId: req.tenantId, email: normalizedEmail, _id: { $ne: current.userId } })))
        return res.status(409).json({ message: "A valid, unique teacher email is required" });
      const teacher = await Teacher.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId },
        { $set: profile },
        { new: true, runValidators: true },
      );
      if (!teacher)
        return res.status(404).json({ message: "Teacher not found" });
      if (name || email)
        await User.updateOne(
          { _id: teacher.userId, tenantId: req.tenantId },
          { $set: { ...(name ? { name } : {}), ...(normalizedEmail ? { email: normalizedEmail } : {}) } },
        );
      return res.json(await teacher.populate([
        { path: "userId", select: "name email isActive" },
        { path: "departmentId", select: "name code" },
        { path: "teachingSubjectIds", select: "name code" },
      ]));
    } catch (e) {
      next(e);
    }
  },
);
peopleRouter.post(
  "/teachers/:id/resend-invitation",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const teacher = await Teacher.findOne({ _id: req.params.id, tenantId: req.tenantId });
      if (!teacher) return res.status(404).json({ message: "Teacher not found" });
      const user = await User.findOne({ _id: teacher.userId, tenantId: req.tenantId, roles: "teacher" });
      if (!user) return res.status(409).json({ message: "Linked teacher login account was not found" });
      if (!user.mustChangePassword)
        return res.status(409).json({ message: "Invitation resend is only available before the teacher completes first login. Use self-service password recovery instead." });
      const temporaryPassword = generateTemporaryPassword();
      const delivery = await deliverTeacherInvitation({ name: user.name, email: user.email, phone: teacher.phone, temporaryPassword });
      const deliveryFields = { credentialDeliveryStatus: delivery.status, credentialDeliveryChannel: delivery.channel || undefined, credentialDeliveryLastAttemptAt: new Date() };
      if (delivery.status === "delivered") {
        user.passwordHash = await bcrypt.hash(temporaryPassword, 12);
        user.mustChangePassword = true;
        user.isActive = true;
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpiresAt = undefined;
        user.credentialDeliveredAt = new Date();
      }
      Object.assign(user, deliveryFields);
      await user.save();
      return res.json({ notification: { status: delivery.status, channel: delivery.channel } });
    } catch (error) {
      next(error);
    }
  },
);
peopleRouter.patch(
  "/teachers/:id/status",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const teacher = await Teacher.findOne({
        _id: req.params.id,
        tenantId: req.tenantId,
      });
      if (!teacher)
        return res.status(404).json({ message: "Teacher not found" });
      teacher.isActive = Boolean(req.body.isActive);
      await teacher.save();
      await User.updateOne(
        { _id: teacher.userId, tenantId: req.tenantId },
        { $set: { isActive: teacher.isActive } },
      );
      return res.json(teacher);
    } catch (e) {
      next(e);
    }
  },
);
peopleRouter.get(
  "/teacher/assignments",
  allowRoles("teacher"),
  async (req, res, next) => {
    try {
      const teacher = await Teacher.findOne({
        tenantId: req.tenantId,
        userId: req.user.id,
        isActive: true,
      });
      if (!teacher) return res.json([]);
      return res.json(
        await TeacherAssignment.find({
          tenantId: req.tenantId,
          teacherId: teacher._id,
          isActive: true,
        })
          .populate("courseId departmentId sectionId subjectId")
          .lean(),
      );
    } catch (e) {
      next(e);
    }
  },
);

peopleRouter.get("/teacher/class-teachers", allowRoles("teacher"), async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ tenantId: req.tenantId, userId: req.user.id, isActive: true });
    if (!teacher) return res.json([]);
    return res.json(await ClassTeacherAssignment.find({ tenantId: req.tenantId, teacherId: teacher._id, isActive: true }).populate("academicYearId courseId departmentId sectionId", "name").lean());
  } catch (error) { return next(error); }
});

peopleRouter.get("/students", async (req, res, next) => {
  try {
    let filter = { tenantId: req.tenantId };
    if (req.user.roles.includes("parent")) {
      const links = await ParentStudentLink.find({
        tenantId: req.tenantId,
        parentUserId: req.user.id,
        verified: true,
      }).distinct("studentId");
      filter._id = { $in: links };
    } else if (req.user.roles.includes("teacher")) {
      const teacher = await Teacher.findOne({
        tenantId: req.tenantId,
        userId: req.user.id,
        isActive: true,
      });
      const [classTeacher, timetableTeacher] = await Promise.all([
        ClassTeacherAssignment.exists({ tenantId: req.tenantId, teacherId: teacher?._id, courseId: req.query.courseId, departmentId: req.query.departmentId, sectionId: req.query.sectionId, isActive: true }),
        Timetable.exists({ tenantId: req.tenantId, courseId: req.query.courseId, departmentId: req.query.departmentId, sectionId: req.query.sectionId, status: "published", $or: [{ "entries.teacherId": teacher?._id }, { "entries.substituteTeacherId": teacher?._id }] }),
      ]);
      const permitted = Boolean(req.query.courseId && req.query.departmentId && req.query.sectionId && (classTeacher || timetableTeacher));
      if (!permitted)
        return res
          .status(403)
          .json({ message: "Class is not assigned to this teacher" });
      filter.courseId = req.query.courseId;
      filter.departmentId = req.query.departmentId;
      filter.sectionId = req.query.sectionId;
    } else if (!req.user.roles.includes("admin"))
      return res.status(403).json({ message: "Insufficient permissions" });
    if (req.query.courseId) filter.courseId = req.query.courseId;
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.sectionId) filter.sectionId = req.query.sectionId;
    if (req.query.q) {
      const q = { $regex: String(req.query.q), $options: "i" };
      filter = {
        ...filter,
        $or: [{ name: q }, { rollNumber: q }, { admissionNumber: q }],
      };
    }
    return res.json(
      await Student.find(filter)
        .populate("courseId departmentId sectionId", "name")
        .sort({ createdAt: -1 })
        .lean(),
    );
  } catch (e) {
    next(e);
  }
});
peopleRouter.post("/students", allowRoles("admin"), async (req, res, next) => {
  try {
    if (!(await validateStudentStructure(req.body, req.tenantId)))
      return res.status(400).json({ message: "A valid class, stream, and section combination is required" });
    const { tenantId: _tenantId, classId: _legacyClassId, ...body } = req.body;
    return res.status(201).json(await Student.create({ ...body, tenantId: req.tenantId }));
  } catch (e) {
    next(e);
  }
});
peopleRouter.post(
  "/students/import",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      if (!Array.isArray(req.body.rows) || !req.body.rows.length)
        return res.status(400).json({ message: "rows array is required" });
      const structures = await Promise.all(req.body.rows.map((row) => validateStudentStructure(row, req.tenantId)));
      if (structures.some((valid) => !valid))
        return res.status(400).json({ message: "Every student requires a valid class, stream, and section combination" });
      const rows = req.body.rows.map(({ tenantId: _tenantId, classId: _legacyClassId, ...row }) => ({ ...row, tenantId: req.tenantId }));
      const result = await Student.insertMany(rows, { ordered: false });
      return res.status(201).json({ imported: result.length });
    } catch (e) {
      next(e);
    }
  },
);
peopleRouter.patch(
  "/students/:id",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const existing = await Student.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
      if (!existing) return res.status(404).json({ message: "Student not found" });
      const { tenantId: _tenantId, classId: _legacyClassId, ...changes } = req.body;
      if (!(await validateStudentStructure({ ...existing, ...changes }, req.tenantId)))
        return res.status(400).json({ message: "A valid class, stream, and section combination is required" });
      const student = await Student.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId },
        { $set: changes },
        { new: true, runValidators: true },
      );
      if (!student)
        return res.status(404).json({ message: "Student not found" });
      return res.json(student);
    } catch (e) {
      next(e);
    }
  },
);
peopleRouter.patch(
  "/students/:id/status",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const student = await Student.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId },
        { $set: { isActive: Boolean(req.body.isActive) } },
        { new: true },
      );
      if (!student)
        return res.status(404).json({ message: "Student not found" });
      return res.json(student);
    } catch (e) {
      next(e);
    }
  },
);
peopleRouter.get(
  "/parents",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const parents = await User.find({ tenantId: req.tenantId, roles: "parent" })
        .select("name email phone isActive mustChangePassword credentialDeliveryStatus credentialDeliveryChannel credentialDeliveryLastAttemptAt lastLoginAt createdAt")
        .sort({ createdAt: -1 }).lean();
      const links = await ParentStudentLink.find({ tenantId: req.tenantId, parentUserId: { $in: parents.map((parent) => parent._id) } })
        .populate("studentId", "name rollNumber admissionNumber").lean();
      const grouped = new Map();
      for (const link of links) {
        const key = String(link.parentUserId);
        grouped.set(key, [...(grouped.get(key) || []), { linkId: link._id, relationship: link.relationship, student: link.studentId }]);
      }
      return res.json(parents.map((parent) => ({ ...parent, linkedStudents: grouped.get(String(parent._id)) || [] })));
    } catch (error) { next(error); }
  },
);
peopleRouter.post(
  "/parents",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const name = String(req.body.name || "").trim();
      const email = String(req.body.email || "").trim().toLowerCase();
      const phone = String(req.body.phone || "").replace(/[\s-]/g, "");
      const relationship = String(req.body.relationship || "guardian").toLowerCase();
      const studentIds = await validateParentStudents(req.body.studentIds || [], req.tenantId);
      if (!name || !validEmail(email) || !validPhone(phone) || !studentIds || !["father", "mother", "guardian"].includes(relationship))
        return res.status(400).json({ message: "Valid name, mobile, email, relationship and linked students are required" });
      if (await User.exists({ tenantId: req.tenantId, email })) return res.status(409).json({ message: "A parent account with this email already exists" });
      const temporaryPassword = generateTemporaryPassword();
      const user = await User.create({ tenantId: req.tenantId, name, email, phone, roles: ["parent"], passwordHash: await bcrypt.hash(temporaryPassword, 12), mustChangePassword: true, credentialDeliveryStatus: "pending" });
      if (studentIds.length) await ParentStudentLink.insertMany(studentIds.map((studentId) => ({ tenantId: req.tenantId, parentUserId: user._id, studentId, relationship, verified: true })));
      const delivery = await deliverParentCredentials(user, temporaryPassword);
      return res.status(201).json({ parent: { ...user.toObject(), passwordHash: undefined }, notification: { status: delivery.status, channel: delivery.channel } });
    } catch (error) { next(error); }
  },
);
peopleRouter.patch(
  "/parents/:id",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid parent" });
      const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId, roles: "parent" });
      if (!user) return res.status(404).json({ message: "Parent not found" });
      const name = String(req.body.name || "").trim(), email = String(req.body.email || "").trim().toLowerCase(), phone = String(req.body.phone || "").replace(/[\s-]/g, "");
      const relationship = String(req.body.relationship || "guardian").toLowerCase();
      const studentIds = await validateParentStudents(req.body.studentIds || [], req.tenantId);
      if (!name || !validEmail(email) || !validPhone(phone) || !studentIds || !["father", "mother", "guardian"].includes(relationship)) return res.status(400).json({ message: "Valid parent details are required" });
      if (await User.exists({ _id: { $ne: user._id }, tenantId: req.tenantId, email })) return res.status(409).json({ message: "A parent account with this email already exists" });
      Object.assign(user, { name, email, phone }); await user.save();
      await ParentStudentLink.deleteMany({ tenantId: req.tenantId, parentUserId: user._id, studentId: { $nin: studentIds } });
      for (const studentId of studentIds) await ParentStudentLink.updateOne({ tenantId: req.tenantId, parentUserId: user._id, studentId }, { $set: { relationship, verified: true } }, { upsert: true });
      return res.json({ success: true });
    } catch (error) { next(error); }
  },
);
peopleRouter.patch("/parents/:id/status", allowRoles("admin"), async (req, res, next) => {
  try {
    const user = await User.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId, roles: "parent" }, { $set: { isActive: Boolean(req.body.isActive) } }, { new: true }).select("name email isActive");
    if (!user) return res.status(404).json({ message: "Parent not found" }); return res.json(user);
  } catch (error) { next(error); }
});
peopleRouter.post("/parents/:id/credentials", allowRoles("admin"), async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId, roles: "parent" }).select("+passwordHash +passwordResetTokenHash +passwordResetExpiresAt");
    if (!user) return res.status(404).json({ message: "Parent not found" });
    if (req.body.mode === "resend" && !user.mustChangePassword) return res.status(409).json({ message: "Credentials can only be resent before the first password change. Use Reset Password instead." });
    const temporaryPassword = generateTemporaryPassword();
    const delivery = await deliverParentInvitation({ name: user.name, email: user.email, phone: user.phone, temporaryPassword });
    if (delivery.status === "delivered") { user.passwordHash = await bcrypt.hash(temporaryPassword, 12); user.mustChangePassword = true; user.isActive = true; user.passwordResetTokenHash = undefined; user.passwordResetExpiresAt = undefined; user.credentialDeliveredAt = new Date(); }
    user.credentialDeliveryStatus = delivery.status; user.credentialDeliveryChannel = delivery.channel || undefined; user.credentialDeliveryLastAttemptAt = new Date(); await user.save();
    return res.json({ notification: { status: delivery.status, channel: delivery.channel } });
  } catch (error) { next(error); }
});
peopleRouter.get(
  "/parent-links",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      return res.json(
        await ParentStudentLink.find({ tenantId: req.tenantId })
          .populate("parentUserId", "name email")
          .populate("studentId", "name rollNumber")
          .lean(),
      );
    } catch (e) {
      next(e);
    }
  },
);
peopleRouter.post(
  "/parent-links",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const { parentUserId, studentId, relationship } = req.body;
      const parent = await User.findOne({
        _id: parentUserId,
        tenantId: req.tenantId,
        roles: "parent",
        isActive: true,
      });
      const student = await Student.findOne({
        _id: studentId,
        tenantId: req.tenantId,
        isActive: true,
      });
      if (!parent || !student)
        return res
          .status(400)
          .json({ message: "Valid parent and student are required" });
      return res
        .status(201)
        .json(
          await ParentStudentLink.create({
            tenantId: req.tenantId,
            parentUserId,
            studentId,
            relationship,
          }),
        );
    } catch (e) {
      next(e);
    }
  },
);
peopleRouter.delete(
  "/parent-links/:id",
  allowRoles("admin"),
  async (req, res, next) => {
    try {
      const result = await ParentStudentLink.deleteOne({
        _id: req.params.id,
        tenantId: req.tenantId,
      });
      return res.json({ success: result.deletedCount === 1 });
    } catch (e) {
      next(e);
    }
  },
);
