import {
  AttendanceSession,
  ClassTeacherAssignment,
  ClassRoom,
  Course,
  Event,
  Examination,
  Result,
  Section,
  Student,
  Subject,
  StreamSubjectMapping,
  Teacher,
  Timetable,
} from "../models/domain.models.js";

export const academicDependencyLabels = {
  streams: ["legacy classes", "subject mappings", "legacy subjects", "teachers", "students", "sections", "class teachers", "timetables"],
  "academic-years": ["legacy classes", "class teachers", "examinations", "timetables"],
  classes: ["legacy classes", "legacy subjects", "students", "sections", "class teachers", "attendance", "examinations", "timetables"],
  sections: ["class teachers", "students", "attendance", "timetables"],
  subjects: ["stream mappings", "attendance", "results", "timetables"],
  "stream-subjects": [],
  "class-teachers": [],
};

const checks = {
  streams: [[ClassRoom,"departmentId"],[StreamSubjectMapping,"streamId"],[Subject,"departmentId"],[Teacher,"departmentId"],[Student,"departmentId"],[Section,"departmentId"],[ClassTeacherAssignment,"departmentId"],[Timetable,"departmentId"]],
  "academic-years": [[ClassRoom,"academicYearId"],[ClassTeacherAssignment,"academicYearId"],[Examination,"academicYearId"],[Timetable,"academicYearId"]],
  classes: [[ClassRoom,"courseId"],[Subject,"courseId"],[Student,"courseId"],[Section,"courseId"],[ClassTeacherAssignment,"courseId"],[AttendanceSession,"courseId"],[Examination,"courseId"],[Timetable,"courseId"]],
  sections: [[ClassTeacherAssignment,"sectionId"],[Student,"sectionId"],[AttendanceSession,"sectionId"],[Timetable,"sectionId"]],
  subjects: [[StreamSubjectMapping,"subjectId"],[AttendanceSession,"subjectId"],[Result,"subjectId"],[Timetable,"entries.subjectId"]],
  "stream-subjects": [],
  "class-teachers": [],
};

export async function findAcademicDependency(resource, id, tenantId) {
  const resourceChecks = checks[resource] || [];
  for (let index = 0; index < resourceChecks.length; index += 1) {
    const [Model, field] = resourceChecks[index];
    if (await Model.exists({ tenantId, [field]: id })) return academicDependencyLabels[resource][index];
  }
  return null;
}
