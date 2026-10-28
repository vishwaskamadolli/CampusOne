import mongoose from "mongoose";

const { Schema, model } = mongoose;
const tenant = { type: Schema.Types.ObjectId, required: true, index: true };
const named = (extra = {}) =>
  new Schema(
    {
      tenantId: tenant,
      name: { type: String, required: true, trim: true },
      code: { type: String, trim: true, uppercase: true },
      isActive: { type: Boolean, default: true },
      ...extra,
    },
    { timestamps: true },
  );

export const Department = model("Department", named());
export const Course = model(
  "Course",
  named({
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: false,
    },
    // Retained for compatibility with existing course records; unused for PUC.
    durationSemesters: { type: Number, min: 1, max: 16 },
  }),
);
export const AcademicYear = model(
  "AcademicYear",
  named({
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
  }),
);
export const Semester = model(
  "Semester",
  named({
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    number: { type: Number, required: true, min: 1, max: 16 },
  }),
);
export const ClassRoom = model(
  "ClassRoom",
  named({
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    academicYearId: {
      type: Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    semesterId: {
      type: Schema.Types.ObjectId,
      ref: "Semester",
      required: false,
    },
  }),
);
export const Section = model(
  "Section",
  named({
    courseId: { type: Schema.Types.ObjectId, ref: "Course" },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    // Retained only to migrate and read pre-simplification records.
    classId: { type: Schema.Types.ObjectId, ref: "ClassRoom" },
    capacity: { type: Number, min: 1, default: 60 },
  }),
);
export const Subject = model(
  "Subject",
  named({
    category: { type: String, enum: ["Language", "Core"], default: "Core" },
    // Legacy links are retained so existing records and references remain valid.
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: false },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    semesterId: {
      type: Schema.Types.ObjectId,
      ref: "Semester",
      required: false,
    },
    legacyMappingMigratedAt: Date,
    credits: { type: Number, min: 0, max: 20, default: 4 },
  }),
);
Subject.schema.path("code").required(true);
export const StreamSubjectMapping = model(
  "StreamSubjectMapping",
  new Schema(
    {
      tenantId: tenant,
      streamId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
      subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
StreamSubjectMapping.schema.index(
  { tenantId: 1, streamId: 1, subjectId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
export const TeacherAssignment = model(
  "TeacherAssignment",
  new Schema(
    {
      tenantId: tenant,
      teacherId: {
        type: Schema.Types.ObjectId,
        ref: "Teacher",
        required: true,
      },
      classId: {
        type: Schema.Types.ObjectId,
        ref: "ClassRoom",
        required: false,
      },
      courseId: { type: Schema.Types.ObjectId, ref: "Course" },
      departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
      sectionId: {
        type: Schema.Types.ObjectId,
        ref: "Section",
        required: true,
      },
      subjectId: {
        type: Schema.Types.ObjectId,
        ref: "Subject",
        required: true,
      },
      periods: [
        {
          day: { type: String, required: true },
          period: { type: Number, required: true, min: 1, max: 12 },
        },
      ],
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);

for (const schema of [
  Department.schema,
  Course.schema,
  AcademicYear.schema,
  Semester.schema,
  ClassRoom.schema,
  Section.schema,
  Subject.schema,
])
  schema.index({ tenantId: 1, code: 1 }, { unique: true, sparse: true });
TeacherAssignment.schema.index(
  { tenantId: 1, teacherId: 1, courseId: 1, departmentId: 1, sectionId: 1, subjectId: 1 },
  { unique: true },
);

export const ClassTeacherAssignment = model(
  "ClassTeacherAssignment",
  new Schema(
    {
      tenantId: tenant,
      academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
      courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
      departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
      // Legacy parent-class reference; no longer written by the simplified UI.
      classId: { type: Schema.Types.ObjectId, ref: "ClassRoom" },
      sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
      teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
ClassTeacherAssignment.schema.index(
  { tenantId: 1, academicYearId: 1, courseId: 1, departmentId: 1, sectionId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

export const Teacher = model(
  "Teacher",
  new Schema(
    {
      tenantId: tenant,
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      employeeNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
      },
      departmentId: {
        type: Schema.Types.ObjectId,
        ref: "Department",
        required: true,
      },
      phone: { type: String, trim: true },
      qualification: String,
      teachingSubjectIds: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
Teacher.schema.index({ tenantId: 1, employeeNumber: 1 }, { unique: true });
Teacher.schema.index({ tenantId: 1, userId: 1 }, { unique: true });

export const Student = model(
  "Student",
  new Schema(
    {
      tenantId: tenant,
      name: { type: String, required: true, trim: true },
      rollNumber: { type: String, required: true, trim: true, uppercase: true },
      admissionNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
      },
      courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
      departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
      classId: {
        type: Schema.Types.ObjectId,
        ref: "ClassRoom",
        required: false,
      },
      sectionId: {
        type: Schema.Types.ObjectId,
        ref: "Section",
        required: true,
      },
      semesterId: {
        type: Schema.Types.ObjectId,
        ref: "Semester",
        required: false,
      },
      email: { type: String, trim: true, lowercase: true },
      phone: String,
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
Student.schema.index({ tenantId: 1, rollNumber: 1 }, { unique: true });
Student.schema.index({ tenantId: 1, admissionNumber: 1 }, { unique: true });

export const ParentStudentLink = model(
  "ParentStudentLink",
  new Schema(
    {
      tenantId: tenant,
      parentUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      studentId: {
        type: Schema.Types.ObjectId,
        ref: "Student",
        required: true,
      },
      relationship: {
        type: String,
        enum: ["father", "mother", "guardian"],
        default: "guardian",
      },
      verified: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
ParentStudentLink.schema.index(
  { tenantId: 1, parentUserId: 1, studentId: 1 },
  { unique: true },
);

const timetableEntrySchema = new Schema(
  {
    timingId: { type: String, trim: true },
    day: { type: String, required: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    type: { type: String, enum: ["period", "break", "lunch"], default: "period" },
    label: { type: String, trim: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    substituteTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    subjectOverride: { type: Boolean, default: false },
    room: { type: String, trim: true },
  },
  { _id: true },
);

export const TimetableSettings = model(
  "TimetableSettings",
  new Schema(
    {
      tenantId: { type: Schema.Types.ObjectId, required: true, unique: true },
      workingDays: [{ type: String, enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], required: true }],
      timings: [{
        label: { type: String, required: true, trim: true },
        startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        type: { type: String, enum: ["period", "break", "lunch"], default: "period" },
      }],
    },
    { timestamps: true },
  ),
);

export const Timetable = model(
  "Timetable",
  new Schema(
    {
      tenantId: tenant,
      academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
      courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
      departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
      classId: { type: Schema.Types.ObjectId, ref: "ClassRoom" },
      sectionId: { type: Schema.Types.ObjectId, ref: "Section", required: true },
      workingDays: [{ type: String, required: true }],
      periodTimings: [{ label: String, startTime: String, endTime: String }],
      entries: [timetableEntrySchema],
      status: { type: String, enum: ["draft", "published"], default: "draft" },
      publishedAt: Date,
    },
    { timestamps: true },
  ),
);
Timetable.schema.index(
  { tenantId: 1, academicYearId: 1, courseId: 1, departmentId: 1, sectionId: 1 },
  { unique: true },
);

export const AttendanceSession = model(
  "AttendanceSession",
  new Schema(
    {
      tenantId: tenant,
      assignmentId: {
        type: Schema.Types.ObjectId,
        ref: "TeacherAssignment",
        required: false,
      },
      classId: {
        type: Schema.Types.ObjectId,
        ref: "ClassRoom",
        required: false,
      },
      courseId: { type: Schema.Types.ObjectId, ref: "Course" },
      departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
      sectionId: {
        type: Schema.Types.ObjectId,
        ref: "Section",
        required: true,
      },
      subjectId: {
        type: Schema.Types.ObjectId,
        ref: "Subject",
        required: true,
      },
      teacherId: {
        type: Schema.Types.ObjectId,
        ref: "Teacher",
        required: true,
      },
      scheduledTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
      timetableId: { type: Schema.Types.ObjectId, ref: "Timetable" },
      timetableEntryId: { type: Schema.Types.ObjectId },
      startTime: String,
      endTime: String,
      exceptionReason: { type: String, trim: true },
      date: { type: String, required: true },
      period: { type: Number, required: true, min: 1, max: 12 },
      status: {
        type: String,
        enum: ["submitted", "cancelled"],
        default: "submitted",
      },
      submittedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
  ),
);
AttendanceSession.schema.index(
  { tenantId: 1, courseId: 1, departmentId: 1, sectionId: 1, subjectId: 1, date: 1, period: 1 },
  { unique: true },
);
export const AttendanceRecord = model(
  "AttendanceRecord",
  new Schema(
    {
      tenantId: tenant,
      sessionId: {
        type: Schema.Types.ObjectId,
        ref: "AttendanceSession",
        required: true,
      },
      studentId: {
        type: Schema.Types.ObjectId,
        ref: "Student",
        required: true,
      },
      status: {
        type: String,
        enum: ["present", "absent", "late", "excused"],
        required: true,
      },
    },
    { timestamps: true },
  ),
);
AttendanceRecord.schema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const AttendanceCorrection = model(
  "AttendanceCorrection",
  new Schema(
    {
      tenantId: tenant,
      sessionId: { type: Schema.Types.ObjectId, ref: "AttendanceSession", required: true },
      requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
      changes: [{ studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true }, status: { type: String, enum: ["present", "absent", "late", "excused"], required: true } }],
      reason: { type: String, required: true, trim: true },
      status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reviewReason: { type: String, trim: true },
      reviewedAt: Date,
    },
    { timestamps: true },
  ),
);
AttendanceCorrection.schema.index({ tenantId: 1, sessionId: 1, status: 1 });

export const AttendanceAudit = model(
  "AttendanceAudit",
  new Schema(
    {
      tenantId: tenant,
      sessionId: { type: Schema.Types.ObjectId, ref: "AttendanceSession", required: true },
      studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
      previousStatus: { type: String, required: true },
      newStatus: { type: String, required: true },
      reason: { type: String, required: true, trim: true },
      actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      correctionId: { type: Schema.Types.ObjectId, ref: "AttendanceCorrection" },
    },
    { timestamps: true },
  ),
);

export const Examination = model(
  "Examination",
  new Schema(
    {
      tenantId: tenant,
      name: { type: String, required: true, trim: true },
      academicYearId: {
        type: Schema.Types.ObjectId,
        ref: "AcademicYear",
        required: true,
      },
      classId: {
        type: Schema.Types.ObjectId,
        ref: "ClassRoom",
        required: false,
      },
      courseId: { type: Schema.Types.ObjectId, ref: "Course" },
      departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
      sectionId: { type: Schema.Types.ObjectId, ref: "Section" },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      timetableEntries: [{
        subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
        date: { type: Date, required: true },
        startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        maxMarks: { type: Number, required: true, min: 1, max: 1000 },
      }],
      timetableStatus: { type: String, enum: ["draft", "published"], default: "draft" },
      timetablePublishedAt: Date,
      status: {
        type: String,
        enum: ["draft", "review", "published"],
        default: "draft",
      },
    },
    { timestamps: true },
  ),
);
export const Result = model(
  "Result",
  new Schema(
    {
      tenantId: tenant,
      examinationId: {
        type: Schema.Types.ObjectId,
        ref: "Examination",
        required: true,
      },
      studentId: {
        type: Schema.Types.ObjectId,
        ref: "Student",
        required: true,
      },
      subjectId: {
        type: Schema.Types.ObjectId,
        ref: "Subject",
        required: true,
      },
      marks: { type: Number, required: true, min: 0 },
      maxMarks: { type: Number, required: true, min: 1 },
      grade: String,
      enteredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
      approved: { type: Boolean, default: false },
    },
    { timestamps: true },
  ),
);
Result.schema.index(
  { tenantId: 1, examinationId: 1, studentId: 1, subjectId: 1 },
  { unique: true },
);

export const Event = model(
  "Event",
  new Schema(
    {
      tenantId: tenant,
      title: { type: String, required: true, trim: true },
      type: {
        type: String,
        enum: ["event", "holiday", "exam", "meeting", "notice"],
        default: "event",
      },
      description: { type: String, required: true, trim: true },
      startsAt: { type: Date, required: true },
      endsAt: Date,
      targetAllParents: { type: Boolean, default: true },
      targetClassIds: [{ type: Schema.Types.ObjectId, ref: "ClassRoom" }],
      imageUrl: String,
      status: { type: String, enum: ["draft", "published"], default: "draft" },
      publishedAt: Date,
    },
    { timestamps: true },
  ),
);
export const Notification = model(
  "Notification",
  new Schema(
    {
      tenantId: tenant,
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      type: {
        type: String,
        enum: ["absence", "result", "event", "announcement"],
        required: true,
      },
      title: { type: String, required: true },
      message: { type: String, required: true },
      entityType: String,
      entityId: Schema.Types.ObjectId,
      dedupeKey: { type: String, required: true },
      readAt: Date,
      channels: {
        inApp: { type: Boolean, default: true },
        push: {
          type: String,
          enum: ["pending", "sent", "disabled"],
          default: "disabled",
        },
        email: {
          type: String,
          enum: ["pending", "sent", "disabled"],
          default: "disabled",
        },
      },
    },
    { timestamps: true },
  ),
);
Notification.schema.index(
  { tenantId: 1, userId: 1, dedupeKey: 1 },
  { unique: true },
);
