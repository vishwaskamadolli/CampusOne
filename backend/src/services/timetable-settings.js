import { Timetable, TimetableSettings } from "../models/domain.models.js";

export const timetableDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const defaultTimings = [
  { label: "Period 1", startTime: "09:00", endTime: "09:45", type: "period" },
  { label: "Period 2", startTime: "09:45", endTime: "10:30", type: "period" },
  { label: "Period 3", startTime: "10:30", endTime: "11:15", type: "period" },
  { label: "Period 4", startTime: "11:15", endTime: "12:00", type: "period" },
  { label: "Midday Break", startTime: "12:00", endTime: "13:00", type: "lunch" },
  { label: "Period 5", startTime: "13:00", endTime: "13:45", type: "period" },
  { label: "Period 6", startTime: "13:45", endTime: "14:30", type: "period" },
  { label: "Period 7", startTime: "14:30", endTime: "15:15", type: "period" },
  { label: "Period 8", startTime: "15:15", endTime: "16:00", type: "period" },
];

export function validateTimetableSettings(body) {
  if (!Array.isArray(body.workingDays) || !body.workingDays.length || body.workingDays.some((day) => !timetableDays.includes(day)))
    return "Select at least one valid working day";
  if (!Array.isArray(body.timings) || !body.timings.length) return "Add at least one timetable column";
  const pattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const [index, timing] of body.timings.entries()) {
    if (!String(timing.label || "").trim() || !["period", "break", "lunch"].includes(timing.type) || !pattern.test(timing.startTime || "") || !pattern.test(timing.endTime || "") || timing.startTime >= timing.endTime)
      return `Timing ${index + 1} is invalid`;
    if (body.timings.slice(0, index).some((other) => other.startTime < timing.endTime && timing.startTime < other.endTime))
      return `Timing ${index + 1} overlaps another timetable column`;
  }
  const teaching = body.timings.filter((timing) => timing.type === "period");
  const lunchIndex = body.timings.findIndex((timing) => timing.type === "lunch");
  const lunch = body.timings[lunchIndex];
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  if (teaching.length < 1 || teaching.length > 12) return "The college schedule must contain between 1 and 12 teaching periods";
  if (!lunch || body.timings.filter((timing) => timing.type === "lunch").length !== 1 || minutes(lunch.endTime) - minutes(lunch.startTime) !== 60)
    return "Add exactly one 1-hour midday break";
  return null;
}

export async function getOrCreateTimetableSettings(tenantId) {
  let settings = await TimetableSettings.findOne({ tenantId });
  if (settings) {
    const hasTimetables = Boolean(await Timetable.exists({ tenantId }));
    if (!hasTimetables && validateTimetableSettings(settings.toObject())) {
      settings.workingDays = timetableDays.slice(0, 5);
      settings.timings = defaultTimings;
      await settings.save();
    } else if (hasTimetables && settings.timings.filter((timing) => timing.type === "period").length === 4) {
      const workingDays = [...settings.workingDays];
      settings.timings = defaultTimings;
      await settings.save();
      const teachingTimings = settings.timings.filter((timing) => timing.type === "period");
      const lunch = settings.timings.find((timing) => timing.type === "lunch");
      const timetables = await Timetable.find({ tenantId });
      for (const timetable of timetables) {
        const migrated = [];
        for (const day of workingDays) {
          const existingPeriods = timetable.entries.filter((entry) => entry.day === day && entry.type === "period").sort((a, b) => a.startTime.localeCompare(b.startTime));
          existingPeriods.slice(0, 8).forEach((entry, index) => {
            const timing = teachingTimings[index];
            entry.timingId = String(timing._id); entry.startTime = timing.startTime; entry.endTime = timing.endTime; entry.label = timing.label;
            migrated.push(entry);
          });
          if (lunch) {
            const existingLunch = timetable.entries.find((entry) => entry.day === day && entry.type !== "period");
            migrated.push({ ...(existingLunch?._id ? { _id: existingLunch._id } : {}), day, timingId: String(lunch._id), startTime: lunch.startTime, endTime: lunch.endTime, type: "lunch", label: lunch.label });
          }
        }
        timetable.workingDays = workingDays;
        timetable.periodTimings = settings.timings.map((timing) => ({ label: timing.label, startTime: timing.startTime, endTime: timing.endTime }));
        timetable.entries = migrated;
        await timetable.save();
      }
    }
    return settings;
  }
  const legacy = await Timetable.findOne({ tenantId }).sort({ createdAt: 1 }).lean();
  const timings = legacy?.periodTimings?.length
    ? legacy.periodTimings.map((timing, index) => ({
        label: timing.label || `Period ${index + 1}`,
        startTime: timing.startTime,
        endTime: timing.endTime,
        type: legacy.entries.find((entry) => entry.startTime === timing.startTime && entry.endTime === timing.endTime)?.type || "period",
      }))
    : defaultTimings;
  settings = await TimetableSettings.findOneAndUpdate(
    { tenantId },
    { $setOnInsert: { tenantId, workingDays: legacy?.workingDays?.length ? legacy.workingDays : timetableDays.slice(0, 5), timings } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return settings;
}
