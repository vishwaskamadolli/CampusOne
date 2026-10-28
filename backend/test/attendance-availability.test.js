import test from "node:test";
import assert from "node:assert/strict";
import { attendanceAvailability, isValidAttendanceDate } from "../src/routes/attendance.routes.js";

test("attendance dates require real calendar dates", () => {
  assert.equal(isValidAttendanceDate("2026-10-27"), true);
  assert.equal(isValidAttendanceDate("2026-02-30"), false);
  assert.equal(isValidAttendanceDate("27-10-2026"), false);
});

test("past periods open while future dates and times remain read-only", () => {
  const now = new Date("2026-10-27T04:00:00.000Z"); // 09:30 in Asia/Kolkata
  assert.equal(attendanceAvailability("2026-10-26", "15:00", now).allowed, true);
  assert.equal(attendanceAvailability("2026-10-28", "09:00", now).allowed, false);
  assert.equal(attendanceAvailability("2026-10-27", "09:00", now).allowed, true);
  assert.equal(attendanceAvailability("2026-10-27", "09:45", now).allowed, false);
});
