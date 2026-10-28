import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "../config.js";
import { User } from "../models/user.model.js";
import {
  AcademicYear,
  AttendanceRecord,
  AttendanceSession,
  ClassTeacherAssignment,
  Course,
  Department,
  Event,
  Examination,
  Notification,
  ParentStudentLink,
  Result,
  Section,
  StreamSubjectMapping,
  Student,
  Subject,
  Teacher,
  TeacherAssignment,
  Timetable,
} from "../models/domain.models.js";
import { getOrCreateTimetableSettings } from "../services/timetable-settings.js";

const counts = {};
const errors = [];
const remember = (name, created) => {
  counts[name] ||= { created: 0, existing: 0 };
  counts[name][created ? "created" : "existing"] += 1;
};

async function ensure(Model, name, filter, values) {
  const existing = await Model.findOne(filter);
  if (existing) {
    remember(name, false);
    return existing;
  }
  const item = await Model.create({ ...filter, ...values });
  remember(name, true);
  return item;
}

const slug = (value) => value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
const grade = (marks) => marks >= 90 ? "A+" : marks >= 80 ? "A" : marks >= 70 ? "B+" : marks >= 60 ? "B" : marks >= 50 ? "C" : "D";

async function seed() {
  const admin = await User.findOne({ roles: "admin", isActive: true }).sort({ createdAt: 1 });
  if (!admin) throw new Error("An active administrator is required before seeding");
  const tenantId = admin.tenantId;
  const passwordHash = await bcrypt.hash("CampusSeed@2026", 12);

  const year = await ensure(AcademicYear, "academicYears", { tenantId, name: "2026-27" }, {
    code: "AY-2026-27", startDate: new Date("2026-06-01T00:00:00.000Z"),
    endDate: new Date("2027-03-31T00:00:00.000Z"), isCurrent: true,
  });

  const streams = {};
  for (const name of ["Science", "Commerce", "Arts"])
    streams[name] = await ensure(Department, "streams", { tenantId, name }, { code: `STR-${slug(name)}`, isActive: true });
  const classes = {};
  for (const name of ["1st PUC", "2nd PUC"])
    classes[name] = await ensure(Course, "classes", { tenantId, name }, { code: `CLS-${slug(name)}`, isActive: true });

  const subjectData = [
    ["English", "ENG", "Language"], ["Kannada", "KAN", "Language"],
    ["Physics", "PHY", "Core"], ["Chemistry", "CHE", "Core"],
    ["Mathematics", "MAT", "Core"], ["Biology", "BIO", "Core"],
    ["Accountancy", "ACC", "Core"], ["Business Studies", "BST", "Core"],
    ["Economics", "ECO", "Core"], ["Computer Science", "CSC", "Core"],
  ];
  const subjects = {};
  for (const [name, code, category] of subjectData)
    subjects[code] = await ensure(Subject, "subjects", { tenantId, code }, { name, category, credits: 4, isActive: true });

  const streamSubjects = {
    Science: ["ENG", "KAN", "PHY", "CHE", "MAT", "BIO", "CSC"],
    Commerce: ["ENG", "KAN", "ACC", "BST", "ECO", "CSC"],
    Arts: ["ENG", "KAN", "ECO"],
  };
  for (const [stream, codes] of Object.entries(streamSubjects)) {
    for (const code of codes)
      await ensure(StreamSubjectMapping, "streamSubjectMappings", { tenantId, streamId: streams[stream]._id, subjectId: subjects[code]._id }, { isActive: true });
  }

  const cohorts = [
    ["1st PUC", "Science", "A"], ["1st PUC", "Science", "B"],
    ["2nd PUC", "Science", "A"], ["2nd PUC", "Science", "B"],
    ["1st PUC", "Commerce", "A"], ["1st PUC", "Commerce", "B"],
    ["2nd PUC", "Commerce", "A"], ["2nd PUC", "Commerce", "B"],
    ["1st PUC", "Arts", "A"], ["2nd PUC", "Arts", "A"],
  ];
  const sections = [];
  for (const [course, stream, name] of cohorts) {
    sections.push(await ensure(Section, "sections", {
      tenantId, courseId: classes[course]._id, departmentId: streams[stream]._id, name,
    }, { code: `SEC-${slug(course)}-${slug(stream)}-${name}`, capacity: 60, isActive: true }));
  }

  const teacherData = [
    ["Dr. Shilpa Hegde", "KPUC-T001", "Science", ["PHY", "MAT"], "M.Sc., B.Ed."],
    ["Raghavendra Kulkarni", "KPUC-T002", "Science", ["CHE"], "M.Sc., B.Ed."],
    ["Dr. Nandini Gowda", "KPUC-T003", "Science", ["BIO"], "M.Sc., Ph.D."],
    ["Pradeep Kumar S", "KPUC-T004", "Science", ["CSC"], "MCA, B.Ed."],
    ["Lakshmi Narayan Bhat", "KPUC-T005", "Commerce", ["ACC"], "M.Com., B.Ed."],
    ["Ayesha Fathima", "KPUC-T006", "Commerce", ["BST"], "M.Com., B.Ed."],
    ["Manjunath Shetty", "KPUC-T007", "Commerce", ["ECO"], "M.A., B.Ed."],
    ["Savitha Raj", "KPUC-T008", "Commerce", ["ENG"], "M.A., B.Ed."],
    ["Vijayalakshmi M", "KPUC-T009", "Arts", ["KAN"], "M.A., B.Ed."],
    ["Syed Imran Pasha", "KPUC-T010", "Arts", ["ECO"], "M.A., B.Ed."],
  ];
  const teachers = [];
  for (let i = 0; i < teacherData.length; i += 1) {
    const [name, employeeNumber, stream, codes, qualification] = teacherData[i];
    const email = `faculty${String(i + 1).padStart(2, "0")}@seed.example.invalid`;
    const user = await ensure(User, "teacherUsers", { tenantId, email }, {
      name, passwordHash, roles: ["teacher"], isActive: true, mustChangePassword: false,
      credentialDeliveryStatus: "failed",
    });
    const teacher = await ensure(Teacher, "teachers", { tenantId, employeeNumber }, {
      userId: user._id, departmentId: streams[stream]._id, qualification,
      teachingSubjectIds: codes.map((code) => subjects[code]._id), isActive: true,
    });
    teacher.departmentId = streams[stream]._id;
    teacher.qualification = qualification;
    teacher.teachingSubjectIds = codes.map((code) => subjects[code]._id);
    await teacher.save();
    teachers.push(teacher);
  }

  const studentData = [
    ["Aarav Prakash", "father", "Prakash Rao"], ["Ananya Ramesh", "mother", "Deepa Ramesh"],
    ["Mohammed Zayan", "father", "Abdul Rahman"], ["Sanjana Murthy", "mother", "Roopa Murthy"],
    ["Karthik Shetty", "father", "Naveen Shetty"], ["Niharika Patil", "mother", "Sunita Patil"],
    ["Darshan Kumar", "guardian", "Meera Kumar"], ["Farheen Banu", "mother", "Shabana Banu"],
    ["Chinmay Joshi", "father", "Madhusudan Joshi"], ["Meghana Naik", "mother", "Kavitha Naik"],
  ];
  const students = [];
  const parents = [];
  for (let i = 0; i < studentData.length; i += 1) {
    const [name, relationship, parentName] = studentData[i];
    const [course, stream] = cohorts[i];
    const student = await ensure(Student, "students", { tenantId, admissionNumber: `KPUC26${String(i + 1).padStart(3, "0")}` }, {
      name, rollNumber: `26${stream.slice(0, 2).toUpperCase()}${String(i + 1).padStart(3, "0")}`,
      courseId: classes[course]._id, departmentId: streams[stream]._id, sectionId: sections[i]._id,
      email: `student${String(i + 1).padStart(2, "0")}@seed.example.invalid`, isActive: true,
    });
    students.push(student);
    const email = `parent${String(i + 1).padStart(2, "0")}@seed.example.invalid`;
    const parent = await ensure(User, "parents", { tenantId, email }, {
      name: parentName, passwordHash, roles: ["parent"], isActive: true, mustChangePassword: false,
      credentialDeliveryStatus: "failed",
    });
    parents.push(parent);
    await ensure(ParentStudentLink, "parentStudentLinks", { tenantId, parentUserId: parent._id, studentId: student._id }, { relationship, verified: true });
  }

  const settings = await getOrCreateTimetableSettings(tenantId);
  const teachingTimings = settings.timings.filter((timing) => timing.type === "period");
  const teacherPools = {
    Science: teachers.slice(0, 4), Commerce: teachers.slice(4, 8), Arts: teachers.slice(8, 10),
  };
  const timetables = [];
  for (let i = 0; i < cohorts.length; i += 1) {
    const [course, stream] = cohorts[i];
    const pool = teacherPools[stream];
    const codes = streamSubjects[stream];
    const entries = [];
    for (const day of settings.workingDays) {
      let periodIndex = 0;
      for (const timing of settings.timings) {
        if (timing.type !== "period") {
          entries.push({ timingId: String(timing._id), day, startTime: timing.startTime, endTime: timing.endTime, type: timing.type, label: timing.label });
          continue;
        }
        const teacher = pool[(periodIndex + i) % pool.length];
        const teacherCodes = teacherData[teachers.findIndex((item) => String(item._id) === String(teacher._id))][3];
        const code = teacherCodes.find((value) => codes.includes(value)) || codes[periodIndex % codes.length];
        entries.push({ timingId: String(timing._id), day, startTime: timing.startTime, endTime: timing.endTime,
          type: "period", label: timing.label, subjectId: subjects[code]._id, teacherId: teacher._id, room: `${stream.slice(0, 3).toUpperCase()}-${i + 1}` });
        periodIndex += 1;
      }
    }
    const timetable = await ensure(Timetable, "timetables", {
      tenantId, academicYearId: year._id, courseId: classes[course]._id,
      departmentId: streams[stream]._id, sectionId: sections[i]._id,
    }, { workingDays: settings.workingDays, periodTimings: settings.timings.map(({ label, startTime, endTime }) => ({ label, startTime, endTime })), entries, status: "published", publishedAt: new Date("2026-06-01T00:00:00.000Z") });
    const seededTeacherIds = new Set(teachers.map((teacher) => String(teacher._id)));
    const stableEntries = entries.map((entry) => {
      const existingEntry = timetable.entries.find((item) => item.day === entry.day && String(item.timingId || "") === String(entry.timingId || ""));
      const externallyAssignedTeacher = existingEntry?.teacherId && !seededTeacherIds.has(String(existingEntry.teacherId));
      return { ...entry, ...(existingEntry?._id ? { _id: existingEntry._id } : {}),
        ...(externallyAssignedTeacher ? { teacherId: existingEntry.teacherId, substituteTeacherId: existingEntry.substituteTeacherId } : {}) };
    });
    timetable.workingDays = settings.workingDays;
    timetable.periodTimings = settings.timings.map(({ label, startTime, endTime }) => ({ label, startTime, endTime }));
    timetable.entries = stableEntries;
    timetable.status = "published";
    timetable.publishedAt ||= new Date("2026-06-01T00:00:00.000Z");
    await timetable.save();
    timetables.push(timetable);

    const primaryEntry = timetable.entries.find((entry) => entry.type === "period");
    let assignment = await TeacherAssignment.findOne({ tenantId, sectionId: sections[i]._id });
    if (assignment) remember("teacherAssignments", false);
    else { assignment = new TeacherAssignment({ tenantId }); remember("teacherAssignments", true); }
    Object.assign(assignment, { teacherId: primaryEntry.teacherId, courseId: classes[course]._id,
      departmentId: streams[stream]._id, sectionId: sections[i]._id, subjectId: primaryEntry.subjectId,
      periods: [{ day: primaryEntry.day, period: 1 }], isActive: true });
    await assignment.save();
    const classTeacher = await ensure(ClassTeacherAssignment, "classTeacherAssignments", {
      tenantId, academicYearId: year._id, courseId: classes[course]._id,
      departmentId: streams[stream]._id, sectionId: sections[i]._id,
    }, { teacherId: assignment.teacherId, isActive: true });
    classTeacher.teacherId = assignment.teacherId;
    classTeacher.isActive = true;
    await classTeacher.save();
  }

  const examNames = ["First Unit Test", "Second Unit Test", "Mid-Term Examination", "Preparatory Examination", "Language Assessment", "Science Practical Assessment", "Commerce Internal Assessment", "Monthly Test - August", "Monthly Test - September", "Annual Model Examination"];
  const exams = [];
  for (let i = 0; i < examNames.length; i += 1) {
    const [course, stream] = cohorts[i];
    const start = new Date(Date.UTC(2026, 6 + Math.floor(i / 3), 6 + (i % 3) * 7));
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 3);
    exams.push(await ensure(Examination, "examinations", { tenantId, name: examNames[i], academicYearId: year._id, courseId: classes[course]._id, departmentId: streams[stream]._id }, {
      startDate: start, endDate: end, status: "published",
    }));
  }

  const attendanceDates = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"];
  for (let i = 0; i < students.length; i += 1) {
    const entry = timetables[i].entries.find((item) => item.type === "period" && item.day === "Monday");
    const assignment = await TeacherAssignment.findOne({ tenantId, courseId: students[i].courseId, departmentId: students[i].departmentId, sectionId: students[i].sectionId, subjectId: entry.subjectId });
    const matchingSessions = await AttendanceSession.find({ tenantId, sectionId: students[i].sectionId, date: attendanceDates[i], period: 1 }).sort({ createdAt: 1 });
    let session = matchingSessions[0];
    if (session) remember("attendanceSessions", false);
    else { session = new AttendanceSession({ tenantId }); remember("attendanceSessions", true); }
    const duplicateSessions = matchingSessions.slice(1);
    if (duplicateSessions.length) {
      const duplicateIds = duplicateSessions.map((item) => item._id);
      await AttendanceRecord.deleteMany({ tenantId, sessionId: { $in: duplicateIds }, studentId: students[i]._id });
      await AttendanceSession.deleteMany({ tenantId, _id: { $in: duplicateIds } });
    }
    Object.assign(session, { courseId: students[i].courseId, departmentId: students[i].departmentId,
      sectionId: students[i].sectionId, subjectId: entry.subjectId, date: attendanceDates[i], period: 1,
      assignmentId: assignment?._id, teacherId: entry.teacherId, scheduledTeacherId: entry.teacherId,
      timetableId: timetables[i]._id, timetableEntryId: entry._id, startTime: entry.startTime, endTime: entry.endTime, status: "submitted" });
    await session.save();
    await ensure(AttendanceRecord, "attendanceRecords", { tenantId, sessionId: session._id, studentId: students[i]._id }, {
      status: ["present", "present", "late", "present", "absent", "present", "present", "excused", "present", "present"][i],
    });
    const mark = [86, 78, 91, 73, 82, 69, 88, 76, 84, 71][i];
    const matchingResults = await Result.find({ tenantId, examinationId: exams[i]._id, studentId: students[i]._id }).sort({ createdAt: 1 });
    let result = matchingResults[0];
    if (result) remember("results", false);
    else { result = new Result({ tenantId }); remember("results", true); }
    if (matchingResults.length > 1)
      await Result.deleteMany({ tenantId, _id: { $in: matchingResults.slice(1).map((item) => item._id) } });
    Object.assign(result, { examinationId: exams[i]._id, studentId: students[i]._id, subjectId: entry.subjectId,
      marks: mark, maxMarks: 100, grade: grade(mark), enteredBy: admin._id, approved: true });
    await result.save();
  }

  const eventData = [
    ["Karnataka Rajyotsava Celebration", "event", "Cultural programme and Kannada literary activities in the college auditorium.", "2026-11-01T04:00:00.000Z"],
    ["Second Internal Assessment", "exam", "Internal assessment timetable will be followed as displayed on the notice board.", "2026-11-16T03:30:00.000Z"],
    ["Parent-Teacher Meeting", "meeting", "Parents are invited to discuss academic progress with class teachers.", "2026-11-28T04:30:00.000Z"],
    ["Kanakadasa Jayanti Holiday", "holiday", "College will remain closed on account of Kanakadasa Jayanti.", "2026-11-30T00:00:00.000Z"],
    ["Science Exhibition", "event", "Student teams will present working models and research posters.", "2026-12-05T04:00:00.000Z"],
    ["Scholarship Document Verification", "notice", "Eligible students should submit SSP scholarship documents to the office.", "2026-12-09T04:30:00.000Z"],
    ["Annual Sports Meet", "event", "Inter-class athletics and team events at the college ground.", "2026-12-18T02:30:00.000Z"],
    ["Winter Vacation", "holiday", "Winter vacation begins after the last working day.", "2026-12-24T00:00:00.000Z"],
    ["Preparatory Examination", "exam", "Preparatory examination for second PUC students begins.", "2027-01-11T03:30:00.000Z"],
    ["Republic Day Programme", "event", "Flag hoisting and student parade will begin at 8:30 AM.", "2027-01-26T03:00:00.000Z"],
  ];
  const events = [];
  for (const [title, type, description, startsAt] of eventData)
    events.push(await ensure(Event, "events", { tenantId, title }, { type, description, startsAt: new Date(startsAt), targetAllParents: true, status: "published", publishedAt: new Date("2026-10-27T00:00:00.000Z") }));

  for (let i = 0; i < parents.length; i += 1) {
    await ensure(Notification, "notifications", { tenantId, userId: parents[i]._id, dedupeKey: `seed:puc:event:${events[i]._id}` }, {
      type: "event", title: events[i].title, message: events[i].description, entityType: "Event", entityId: events[i]._id,
      channels: { inApp: true, push: "disabled", email: "disabled" },
    });
  }
}

try {
  await mongoose.connect(config.mongoUri);
  await seed();
  console.log(JSON.stringify({ counts, errors, status: "success" }, null, 2));
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
  console.error(JSON.stringify({ counts, errors, status: "failed" }, null, 2));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
