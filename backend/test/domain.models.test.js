import assert from 'node:assert/strict';
import test from 'node:test';
import { AttendanceAudit, AttendanceCorrection, AttendanceRecord, AttendanceSession, ClassTeacherAssignment, Notification, ParentStudentLink, Result, Student, StreamSubjectMapping, Subject } from '../src/models/domain.models.js';

function hasUnique(model, fields) { return model.schema.indexes().some(([index, options]) => options.unique && fields.every((field) => index[field] === 1)); }
test('attendance sessions prevent duplicate period submissions', () => assert.equal(hasUnique(AttendanceSession, ['tenantId','courseId','departmentId','sectionId','subjectId','date','period']), true));
test('attendance records prevent duplicate students per session', () => assert.equal(hasUnique(AttendanceRecord, ['sessionId','studentId']), true));
test('parent links, results, and alerts are deduplicated', () => { assert.equal(hasUnique(ParentStudentLink, ['tenantId','parentUserId','studentId']), true); assert.equal(hasUnique(Result, ['tenantId','examinationId','studentId','subjectId']), true); assert.equal(hasUnique(Notification, ['tenantId','userId','dedupeKey']), true); });
test('student roll and admission numbers are tenant-unique', () => { assert.equal(hasUnique(Student, ['tenantId','rollNumber']), true); assert.equal(hasUnique(Student, ['tenantId','admissionNumber']), true); });
test('attendance corrections and audits enforce valid workflow fields', () => {
  assert.deepEqual(AttendanceCorrection.schema.path('status').enumValues, ['pending','approved','rejected']);
  assert.equal(AttendanceCorrection.schema.path('reason').isRequired, true);
  assert.equal(AttendanceAudit.schema.path('reason').isRequired, true);
  assert.ok(AttendanceSession.schema.path('timetableId'));
  assert.ok(AttendanceSession.schema.path('timetableEntryId'));
});
test('one active class teacher is allowed per class, section, and academic year', () => {
  const index = ClassTeacherAssignment.schema.indexes().find(([fields]) => fields.tenantId === 1 && fields.academicYearId === 1 && fields.courseId === 1 && fields.departmentId === 1 && fields.sectionId === 1);
  assert.equal(index?.[1].unique, true);
  assert.deepEqual(index?.[1].partialFilterExpression, { isActive: true });
  assert.equal(AttendanceSession.schema.path('assignmentId').isRequired, false);
});
test('subject master and stream mappings use centralized records', () => {
  assert.equal(Subject.schema.path('category').enumValues.join(','), 'Language,Core');
  assert.equal(Subject.schema.path('courseId').isRequired, false);
  assert.equal(hasUnique(StreamSubjectMapping, ['tenantId','streamId','subjectId']), true);
});
