import assert from "node:assert/strict";
import test from "node:test";
import { academicDependencyLabels } from "../src/services/academic-deletion.js";

test("all academic resources have safe-delete dependency rules", () => {
  assert.deepEqual(Object.keys(academicDependencyLabels).sort(), ["academic-years", "class-teachers", "classes", "sections", "stream-subjects", "streams", "subjects"]);
});

test("critical academic relationships are protected", () => {
  assert.ok(academicDependencyLabels.streams.includes("teachers"));
  assert.ok(academicDependencyLabels.classes.includes("students"));
  assert.ok(academicDependencyLabels.classes.includes("timetables"));
  assert.ok(academicDependencyLabels.subjects.includes("results"));
  assert.ok(academicDependencyLabels.subjects.includes("stream mappings"));
  assert.deepEqual(academicDependencyLabels["class-teachers"], []);
});
