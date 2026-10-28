import assert from "node:assert/strict";
import test from "node:test";
import { applyCollegeTimetableSettings } from "../src/routes/timetables.routes.js";
import { defaultTimings, validateTimetableSettings } from "../src/services/timetable-settings.js";

const settings = {
  workingDays: ["Monday", "Tuesday"],
  timings: defaultTimings.map((timing, index) => ({ ...timing, _id: `slot-${index + 1}` })),
};

test("college timetable settings validate days, timing order, and overlap", () => {
  assert.equal(validateTimetableSettings(settings), null);
  assert.equal(validateTimetableSettings({ ...settings, timings: [...settings.timings, { label: "Period 9", startTime: "16:00", endTime: "16:45", type: "period" }] }), null);
  assert.equal(
    validateTimetableSettings({
      ...settings,
      timings: [settings.timings[0], settings.timings[4]],
    }),
    null,
  );
  assert.match(
    validateTimetableSettings({
      ...settings,
      timings: [
        ...Array.from({ length: 13 }, (_, index) => ({
          label: `Period ${index + 1}`,
          startTime: `${String(index).padStart(2, "0")}:00`,
          endTime: `${String(index).padStart(2, "0")}:30`,
          type: "period",
        })),
        { label: "Lunch", startTime: "13:30", endTime: "14:30", type: "lunch" },
      ],
    }),
    /between 1 and 12/,
  );
  assert.match(validateTimetableSettings({ ...settings, workingDays: [] }), /working day/);
  assert.match(validateTimetableSettings({ ...settings, timings: [...settings.timings, { label: "Overlap", startTime: "09:30", endTime: "10:30", type: "period" }] }), /overlaps/);
});

test("visual grid payload reuses college timings and creates shared breaks", () => {
  const result = applyCollegeTimetableSettings({ entries: [{ day: "Monday", timingId: "slot-2", subjectId: "subject-1", teacherId: "teacher-1" }] }, settings);
  assert.deepEqual(result.workingDays, ["Monday", "Tuesday"]);
  assert.equal(result.entries.filter((entry) => entry.type === "lunch").length, 2);
  const period = result.entries.find((entry) => entry.type === "period");
  assert.equal(period.startTime, "09:45");
  assert.equal(period.subjectId, "subject-1");
});

test("editing a grid cell preserves its timetable entry id for attendance references", () => {
  const existing = [{ _id: "entry-1", day: "Monday", timingId: "slot-1", startTime: "09:00", endTime: "09:45", type: "period", subjectId: "old", teacherId: "old" }];
  const result = applyCollegeTimetableSettings({ entries: [{ day: "Monday", timingId: "slot-1", subjectId: "new-subject", teacherId: "new-teacher" }] }, settings, existing);
  assert.equal(result.entries.find((entry) => entry.timingId === "slot-1")._id, "entry-1");
});
