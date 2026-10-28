import { Router } from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { allowRoles, requireAuth, requireTenant } from "../middleware/auth.js";
import { AcademicYear, ClassTeacherAssignment, Course, Department, Section, Subject, StreamSubjectMapping, Teacher } from "../models/domain.models.js";
import { findAcademicDependency } from "../services/academic-deletion.js";
import { ensureSimplifiedAcademicStructure, validateSectionStructure } from "../services/academic-structure.js";

const resources = { streams: Department, classes: Course, "puc-years": Course, "academic-years": AcademicYear, sections: Section, subjects: Subject, "stream-subjects": StreamSubjectMapping, "class-teachers": ClassTeacherAssignment };
const populate = {
  sections: "courseId departmentId",
  subjects: "courseId departmentId",
  "stream-subjects": [{ path: "streamId", select: "name" }, { path: "subjectId", select: "name code category" }],
  "class-teachers": [{ path: "teacherId", populate: { path: "userId", select: "name email" } }, { path: "academicYearId courseId departmentId sectionId", select: "name" }],
};
const allowedNames = { streams: ["Science", "Commerce", "Arts"] };
const writableFields = {
  streams: ["name"], classes: ["name"], "puc-years": ["name"],
  "academic-years": ["name", "startDate", "endDate", "isCurrent"],
  sections: ["name", "courseId", "departmentId", "capacity"],
  subjects: ["name", "code", "category"],
  "stream-subjects": ["streamId", "subjectId"],
  "class-teachers": ["academicYearId", "courseId", "departmentId", "sectionId", "teacherId"],
};

export const academicsRouter = Router();
academicsRouter.use(requireAuth, requireTenant);
academicsRouter.use(async (req, _res, next) => { try { await ensureSimplifiedAcademicStructure(req.tenantId); next(); } catch (error) { next(error); } });

const cleanBody = (resource, body) => Object.fromEntries((writableFields[resource] || []).filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
const internalCode = (name) => `${String(name || "record").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
function validateFixedName(resource, body) {
  const allowed = allowedNames[resource];
  return allowed && body.name !== undefined && !allowed.includes(body.name) ? `${resource === "streams" ? "Stream" : "Class"} must be one of: ${allowed.join(", ")}` : null;
}
async function validateSection(body, tenantId) {
  if (![body.courseId, body.departmentId].every(mongoose.isValidObjectId)) return "Class and stream are required";
  const [course, stream] = await Promise.all([Course.exists({ _id: body.courseId, tenantId, isActive: { $ne: false } }), Department.exists({ _id: body.departmentId, tenantId, isActive: { $ne: false } })]);
  return course && stream ? null : "Class or stream is unavailable";
}
async function validateStreamSubject(body, tenantId) {
  if (![body.streamId, body.subjectId].every(mongoose.isValidObjectId)) return "Stream and subject are required";
  const [stream, subject] = await Promise.all([Department.exists({ _id: body.streamId, tenantId, isActive: { $ne: false } }), Subject.exists({ _id: body.subjectId, tenantId, isActive: { $ne: false } })]);
  return stream && subject ? null : "Stream or subject is unavailable";
}
async function validateClassTeacher(body, tenantId) {
  const required = ["academicYearId", "courseId", "departmentId", "sectionId", "teacherId"];
  if (required.some((key) => !mongoose.isValidObjectId(body[key]))) return "Complete class teacher assignment is required";
  const [year, section, teacher] = await Promise.all([
    AcademicYear.exists({ _id: body.academicYearId, tenantId, isActive: { $ne: false } }),
    validateSectionStructure({ tenantId, courseId: body.courseId, departmentId: body.departmentId, sectionId: body.sectionId }),
    Teacher.exists({ _id: body.teacherId, tenantId, isActive: true }),
  ]);
  return year && section && teacher ? null : "Class teacher selections do not match the academic structure";
}
async function validateResource(resource, body, tenantId) {
  const fixed = validateFixedName(resource, body); if (fixed) return fixed;
  if (["classes", "puc-years"].includes(resource) && !String(body.name || "").trim()) return "Class name is required";
  if (resource === "sections") return validateSection(body, tenantId);
  if (resource === "stream-subjects") return validateStreamSubject(body, tenantId);
  if (resource === "class-teachers") return validateClassTeacher(body, tenantId);
  return null;
}
function escaped(value) { return String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
async function duplicateNamedResource(resource, body, tenantId, excludeId) {
  if (!["streams", "classes", "puc-years", "academic-years", "sections"].includes(resource) || !body.name) return false;
  const Model = resources[resource];
  const identity = { name: { $regex: `^${escaped(body.name)}$`, $options: "i" } };
  const filter = { tenantId, ...identity, ...(excludeId ? { _id: { $ne: excludeId } } : {}) };
  if (resource === "sections") Object.assign(filter, { courseId: body.courseId, departmentId: body.departmentId });
  return Boolean(await Model.exists(filter));
}

academicsRouter.get("/:resource", async (req, res, next) => {
  try {
    const Model = resources[req.params.resource]; if (!Model) return res.status(404).json({ message: "Academic resource not found" });
    let query = Model.find({ tenantId: req.tenantId, isActive: { $ne: false } }).sort({ createdAt: -1 });
    if (populate[req.params.resource]) query = query.populate(populate[req.params.resource]);
    return res.json(await query.lean());
  } catch (error) { return next(error); }
});

academicsRouter.post("/:resource", allowRoles("admin"), async (req, res, next) => {
  try {
    const Model = resources[req.params.resource]; if (!Model) return res.status(404).json({ message: "Academic resource not found" });
    const body = cleanBody(req.params.resource, req.body); const validationError = await validateResource(req.params.resource, body, req.tenantId);
    if (validationError) return res.status(400).json({ message: validationError });
    if (await duplicateNamedResource(req.params.resource, body, req.tenantId)) return res.status(409).json({ message: ["classes", "puc-years"].includes(req.params.resource) ? "A class with this name already exists" : "This academic record already exists" });
    if (req.params.resource === "subjects") {
      const duplicate = await Subject.exists({ tenantId: req.tenantId, $or: [{ code: String(body.code || "").trim().toUpperCase() }, { name: { $regex: `^${escaped(body.name)}$`, $options: "i" } }] });
      if (duplicate) return res.status(409).json({ message: "A subject with this name or code already exists" });
    }
    if (body.name !== undefined) body.name = String(body.name).trim();
    if (body.code !== undefined) body.code = String(body.code).trim().toUpperCase();
    if (Model.schema.path("code") && !body.code && req.params.resource !== "subjects") body.code = internalCode(body.name);
    return res.status(201).json(await Model.create({ ...body, tenantId: req.tenantId }));
  } catch (error) { return next(error); }
});

academicsRouter.patch("/:resource/:id", allowRoles("admin"), async (req, res, next) => {
  try {
    const Model = resources[req.params.resource]; if (!Model || !mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid resource" });
    const existing = await Model.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean(); if (!existing) return res.status(404).json({ message: "Record not found" });
    const body = cleanBody(req.params.resource, req.body); const merged = { ...existing, ...body }; const validationError = await validateResource(req.params.resource, merged, req.tenantId);
    if (validationError) return res.status(400).json({ message: validationError });
    if (await duplicateNamedResource(req.params.resource, merged, req.tenantId, req.params.id)) return res.status(409).json({ message: ["classes", "puc-years"].includes(req.params.resource) ? "A class with this name already exists" : "This academic record already exists" });
    if (req.params.resource === "subjects" && (body.name !== undefined || body.code !== undefined)) {
      const duplicate = await Subject.exists({ _id: { $ne: req.params.id }, tenantId: req.tenantId, $or: [{ code: String(merged.code).trim().toUpperCase() }, { name: { $regex: `^${escaped(merged.name)}$`, $options: "i" } }] });
      if (duplicate) return res.status(409).json({ message: "A subject with this name or code already exists" });
    }
    if (body.name !== undefined) body.name = String(body.name).trim();
    if (body.code !== undefined) body.code = String(body.code).trim().toUpperCase();
    return res.json(await Model.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: body }, { new: true, runValidators: true }));
  } catch (error) { return next(error); }
});

academicsRouter.delete("/:resource/:id", allowRoles("admin"), async (req, res, next) => {
  try {
    const Model = resources[req.params.resource]; if (!Model || !mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid resource" });
    const resource = req.params.resource === "puc-years" ? "classes" : req.params.resource; const dependency = await findAcademicDependency(resource, req.params.id, req.tenantId);
    if (dependency) return res.status(409).json({ message: `Cannot deactivate this record because it is linked to ${dependency}` });
    const item = await Model.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId, isActive: { $ne: false } }, { $set: { isActive: false } }, { new: true });
    if (!item) return res.status(404).json({ message: "Record not found" }); return res.json(item);
  } catch (error) { return next(error); }
});
