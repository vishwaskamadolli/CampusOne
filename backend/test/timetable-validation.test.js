import assert from "node:assert/strict";
import test from "node:test";
import { validateAcademicRelationships, validateEntrySchedule } from "../src/routes/timetables.routes.js";

test("Commerce timetable accepts a section matching the selected class and stream", () => {
  const body = { academicYearId: "year-2026", courseId: "first-puc", departmentId: "commerce", sectionId: "section-b" };
  const refs = {
    academicYear: { _id: body.academicYearId }, course: { _id: body.courseId }, stream: { _id: body.departmentId },
    section: { _id: body.sectionId, courseId: body.courseId, departmentId: body.departmentId },
  };
  assert.equal(validateAcademicRelationships(body, refs), null);
  assert.equal(validateAcademicRelationships({ ...body, departmentId: "science" }, refs), "Selected Section does not belong to the selected class and stream");
});

test("timetable entry validates the actual 24-hour payload without bypassing time order", () => {
  assert.equal(validateEntrySchedule({ day: "Tuesday", startTime: "11:50", endTime: "12:50" }, ["Tuesday"]), null);
  assert.equal(validateEntrySchedule({ day: "Tuesday", startTime: "23:50", endTime: "12:50" }, ["Tuesday"]), "Entry 1: end time must be later than start time");
  assert.equal(validateEntrySchedule({ day: "Saturday", startTime: "09:00", endTime: "10:00" }, ["Monday"]), "Entry 1: Saturday is not enabled as a working day");
});
