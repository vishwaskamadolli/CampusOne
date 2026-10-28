"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  LoaderCircle,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { toastAction, toastError } from "@/lib/toast";

type Item = Record<string, any> & { _id: string; name?: string; code?: string };
type Timing = {
  _id?: string;
  label: string;
  startTime: string;
  endTime: string;
  type: "period" | "break" | "lunch";
};
type Entry = {
  _id?: string;
  timingId?: string;
  day: string;
  startTime: string;
  endTime: string;
  type: Timing["type"];
  label?: string;
  subjectId?: any;
  teacherId?: any;
  room?: string;
  subjectOverride?: boolean;
};
type Timetable = Item & {
  academicYearId: any;
  courseId: any;
  departmentId: any;
  sectionId: any;
  entries: Entry[];
  status: "draft" | "published";
};
type Settings = { workingDays: string[]; timings: Timing[]; locked?: boolean };
type Selection = {
  academicYearId: string;
  courseId: string;
  departmentId: string;
  sectionId: string;
};

const allDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const emptySelection: Selection = {
  academicYearId: "",
  courseId: "",
  departmentId: "",
  sectionId: "",
};
const id = (value: any) =>
  typeof value === "object" ? value?._id || "" : value || "";
const label = (value: any) =>
  value?.name || value?.userId?.name || value?.code || "—";
const cellKey = (day: string, timing: Timing) =>
  `${day}:${timing._id || `${timing.startTime}-${timing.endTime}`}`;
const formatTime12 = (time: string) => {
  const [rawHour, minute] = time.split(":");
  const hour = Number(rawHour);
  if (!Number.isInteger(hour) || minute === undefined) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
};

export function TimetableWorkspace({
  mode = "admin",
  studentId,
}: {
  mode?: "admin" | "teacher" | "parent";
  studentId?: string;
}) {
  const admin = mode === "admin";
  const [items, setItems] = useState<Timetable[]>([]);
  const [refs, setRefs] = useState<Record<string, Item[]>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [cells, setCells] = useState<Record<string, Entry>>({});
  const [editing, setEditing] = useState<Timetable | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const suffix =
        mode === "parent" && studentId ? `?studentId=${studentId}` : "";
      const [rows, schedule] = await Promise.all([
        api<Timetable[]>(`/timetables${suffix}`),
        api<Settings>("/timetables/settings"),
      ]);
      setItems(rows);
      setSettings(schedule);
      if (admin) {
        const names = [
          "academic-years",
          "classes",
          "streams",
          "sections",
          "subjects",
          "stream-subjects",
        ];
        const values = await Promise.all(
          names.map((name) => api<Item[]>(`/academics/${name}`)),
        );
        const teachers = await api<Item[]>("/people/teachers");
        setRefs({
          ...Object.fromEntries(
            names.map((name, index) => [name, values[index]]),
          ),
          teachers,
        });
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load timetable",
      );
    } finally {
      setLoading(false);
    }
  }, [admin, mode, studentId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (
      !admin ||
      !settings ||
      selection.academicYearId ||
      !refs["academic-years"]?.length ||
      !refs.classes?.length ||
      !refs.streams?.length
    )
      return;
    const first = {
      academicYearId: refs["academic-years"][0]._id,
      courseId: refs.classes[0]._id,
      departmentId: refs.streams[0]._id,
      sectionId: "",
    };
    const section = (refs.sections || []).find(
      (item) =>
        id(item.courseId) === first.courseId &&
        id(item.departmentId) === first.departmentId,
    );
    first.sectionId = section?._id || "";
    const existing = items.find(
      (item) =>
        id(item.academicYearId) === first.academicYearId &&
        id(item.courseId) === first.courseId &&
        id(item.departmentId) === first.departmentId &&
        id(item.sectionId) === first.sectionId,
    );
    if (existing) loadIntoGrid(existing);
    else setSelection(first);
  }, [admin, items, refs, selection.academicYearId, settings]);

  const validSections = useMemo(
    () =>
      (refs.sections || []).filter(
        (section) =>
          id(section.courseId) === selection.courseId &&
          id(section.departmentId) === selection.departmentId,
      ),
    [refs.sections, selection.courseId, selection.departmentId],
  );
  const mappedSubjectIds = useMemo(
    () =>
      new Set(
        (refs["stream-subjects"] || [])
          .filter((mapping) => id(mapping.streamId) === selection.departmentId)
          .map((mapping) => id(mapping.subjectId)),
      ),
    [refs, selection.departmentId],
  );
  const subjects = useMemo(
    () =>
      (refs.subjects || []).filter((subject) =>
        mappedSubjectIds.has(subject._id),
      ),
    [refs.subjects, mappedSubjectIds],
  );
  const selectedComplete = Object.values(selection).every(Boolean);

  function selectAcademic(key: keyof Selection, value: string) {
    const next = { ...selection, [key]: value };
    if (key === "courseId" || key === "departmentId") next.sectionId = "";
    setSelection(next);
    setEditing(null);
    setCells({});
    if (key === "sectionId" && value) {
      const found = items.find(
        (item) =>
          id(item.academicYearId) === next.academicYearId &&
          id(item.courseId) === next.courseId &&
          id(item.departmentId) === next.departmentId &&
          id(item.sectionId) === value,
      );
      if (found) loadIntoGrid(found);
    }
  }
  function loadIntoGrid(item: Timetable) {
    setEditing(item);
    setSelection({
      academicYearId: id(item.academicYearId),
      courseId: id(item.courseId),
      departmentId: id(item.departmentId),
      sectionId: id(item.sectionId),
    });
    const next: Record<string, Entry> = {};
    for (const entry of item.entries) {
      const timing = settings?.timings.find(
        (slot) =>
          String(slot._id || "") === String(entry.timingId || "") ||
          (slot.startTime === entry.startTime &&
            slot.endTime === entry.endTime),
      );
      if (timing)
        next[cellKey(entry.day, timing)] = {
          ...entry,
          subjectId: id(entry.subjectId),
          teacherId: id(entry.teacherId),
        };
    }
    setCells(next);
  }
  function updateCell(day: string, timing: Timing, changes: Partial<Entry>) {
    const key = cellKey(day, timing);
    const current = cells[key] || {
      day,
      timingId: timing._id,
      startTime: timing.startTime,
      endTime: timing.endTime,
      type: timing.type,
      label: timing.label,
    };
    setCells({ ...cells, [key]: { ...current, ...changes } });
  }
  async function save() {
    if (!selectedComplete || !settings)
      return setError("Select academic year, class, stream, and section");
    const entries = Object.values(cells).filter(
      (entry) =>
        entry.type !== "period" || (entry.subjectId && entry.teacherId),
    );
    try {
      const result = await toastAction(
        () =>
          api<Timetable>(
            editing ? `/timetables/${editing._id}` : "/timetables",
            {
              method: editing ? "PATCH" : "POST",
              body: JSON.stringify({ ...selection, entries }),
            },
          ),
        { loading: "Saving timetable…", success: "Draft saved" },
      );
      await load();
      setEditing(result);
    } catch (reason) {
      toastError(reason);
      setError(
        reason instanceof Error ? reason.message : "Unable to save timetable",
      );
    }
  }
  async function publish() {
    if (!editing) return;
    try {
      await toastAction(
        () => api(`/timetables/${editing._id}/publish`, { method: "PATCH" }),
        { loading: "Publishing timetable…", success: "Timetable published" },
      );
      await load();
    } catch (reason) {
      toastError(reason);
    }
  }
  async function remove() {
    if (!editing || !confirm("Delete this draft timetable?")) return;
    try {
      await api(`/timetables/${editing._id}`, { method: "DELETE" });
      setEditing(null);
      setCells({});
      await load();
    } catch (reason) {
      toastError(reason);
    }
  }
  async function saveSettings() {
    if (!settingsDraft) return;
    try {
      const saved = await toastAction(
        () =>
          api<Settings>("/timetables/settings", {
            method: "PUT",
            body: JSON.stringify(settingsDraft),
          }),
        {
          loading: "Saving college schedule…",
          success: "College schedule saved",
        },
      );
      setSettings(saved);
      setSettingsOpen(false);
    } catch (reason) {
      toastError(reason);
    }
  }

  if (loading)
    return <LoaderCircle className="mt-10 animate-spin text-brand-600" />;
  if (!settings)
    return (
      <p className="rounded-xl bg-rose-50 p-4 text-rose-700">
        {error || "Timetable settings unavailable"}
      </p>
    );
  if (!admin)
    return (
      <ReadOnlyTimetables
        items={items}
        settings={settings}
        title={mode === "teacher" ? "My Timetable" : "Class Timetable"}
      />
    );

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Weekly Timetable Builder</h2>
          <p className="text-sm text-slate-500">
            Select a section, then assign subjects and teachers directly in the
            weekly grid.
          </p>
        </div>
        <button
          onClick={() => {
            if (settingsOpen) setSettingsOpen(false);
            else {
              setSettingsDraft(structuredClone(settings));
              setSettingsOpen(true);
            }
          }}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold"
        >
          <Settings2 size={17} />
          {settingsOpen
            ? "Hide schedule settings"
            : "College schedule settings"}
        </button>
      </div>
      {error && (
        <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {settingsOpen && settingsDraft && (
        <SettingsPanel
          value={settingsDraft}
          setValue={setSettingsDraft}
          close={() => setSettingsOpen(false)}
          save={saveSettings}
        />
      )}
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["academicYearId", "Academic Year", "academic-years"],
            ["courseId", "Class", "classes"],
            ["departmentId", "Stream", "streams"],
            ["sectionId", "Section", "sections"],
          ] as [keyof Selection, string, string][]
        ).map(([key, title, resource]) => {
          const options =
            key === "sectionId" ? validSections : refs[resource] || [];
          return (
            <label key={key} className="text-sm font-semibold">
              {title}
              <select
                value={selection[key]}
                onChange={(event) => selectAcademic(key, event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-normal"
              >
                <option value="">Select {title}</option>
                {options.map((option) => (
                  <option key={option._id} value={option._id}>
                    {label(option)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {selectedComplete ? (
        <>
          <EditableGrid
            settings={settings}
            cells={cells}
            subjects={subjects}
            teachers={refs.teachers || []}
            updateCell={updateCell}
          />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Save size={17} />
              Save draft
            </button>
            {editing && (
              <>
                <button
                  onClick={publish}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  {editing.status === "published" ? "Republish" : "Publish"}
                </button>
                {editing.status === "draft" && (
                  <button
                    onClick={remove}
                    className="ml-auto flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600"
                  >
                    <Trash2 size={17} />
                    Delete
                  </button>
                )}
              </>
            )}
            {editing && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${editing.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
              >
                {editing.status}
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <CalendarClock className="mx-auto mb-3" />
          Select all four academic fields to open the weekly timetable.
        </div>
      )}
      <div className="mt-8">
        <h3 className="mb-3 font-bold">Existing section timetables</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <button
              key={item._id}
              onClick={() => loadIntoGrid(item)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left"
            >
              <b>
                {label(item.courseId)} · {label(item.departmentId)} ·{" "}
                {label(item.sectionId)}
              </b>
              <p className="mt-1 text-xs text-slate-500">
                {label(item.academicYearId)} · {item.status}
              </p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditableGrid({
  settings,
  cells,
  subjects,
  teachers,
  updateCell,
}: {
  settings: Settings;
  cells: Record<string, Entry>;
  subjects: Item[];
  teachers: Item[];
  updateCell: (day: string, timing: Timing, changes: Partial<Entry>) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky left-0 z-10 border-b border-r bg-slate-50 p-3 text-left">
              Day
            </th>
            {settings.timings.map((timing) => (
              <th
                key={timing._id || timing.startTime}
                className="min-w-44 border-b border-r p-3 text-center"
              >
                <b>{timing.label}</b>
                <p className="text-xs font-normal text-slate-500">
                  {formatTime12(timing.startTime)}–
                  {formatTime12(timing.endTime)}
                </p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {settings.workingDays.map((day) => (
            <tr key={day}>
              <th className="sticky left-0 z-10 border-b border-r bg-white p-3 text-left">
                {day}
              </th>
              {settings.timings.map((timing) => {
                const key = cellKey(day, timing);
                const entry = cells[key];
                if (timing.type !== "period")
                  return (
                    <td
                      key={key}
                      className={`border-b border-r p-3 text-center font-semibold ${timing.type === "lunch" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {timing.label}
                    </td>
                  );
                const subjectId = id(entry?.subjectId);
                const eligible = teachers.filter(
                  (teacher) =>
                    teacher.isActive !== false &&
                    teacher.teachingSubjectIds?.some(
                      (subject: any) => id(subject) === subjectId,
                    ),
                );
                return (
                  <td key={key} className="border-b border-r p-2 align-top">
                    <select
                      aria-label={`${day} ${timing.label} subject`}
                      value={subjectId}
                      onChange={(event) =>
                        updateCell(day, timing, {
                          subjectId: event.target.value,
                          teacherId: "",
                          subjectOverride: false,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                    >
                      <option value="">Free period</option>
                      {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                          {label(subject)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${day} ${timing.label} teacher`}
                      disabled={!subjectId}
                      value={id(entry?.teacherId)}
                      onChange={(event) =>
                        updateCell(day, timing, {
                          teacherId: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs disabled:bg-slate-50"
                    >
                      <option value="">Select teacher</option>
                      {eligible.map((teacher) => (
                        <option key={teacher._id} value={teacher._id}>
                          {label(teacher)}
                        </option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnlyTimetables({
  items,
  settings,
  title,
}: {
  items: Timetable[];
  settings: Settings;
  title: string;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-4 text-2xl font-bold">{title}</h2>
      <div className="space-y-6">
        {items.length ? (
          items.map((item) => (
            <div
              key={item._id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"
            >
              <b>
                {label(item.courseId)} · {label(item.departmentId)} ·{" "}
                {label(item.sectionId)}
              </b>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left">Day</th>
                      {settings.timings.map((timing) => (
                        <th
                          key={timing._id || timing.startTime}
                          className="p-2 text-center"
                        >
                          {timing.label}
                          <small className="block font-normal text-slate-500">
                            {formatTime12(timing.startTime)}–
                            {formatTime12(timing.endTime)}
                          </small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {settings.workingDays.map((day) => (
                      <tr key={day} className="border-t">
                        <th className="p-2 text-left">{day}</th>
                        {settings.timings.map((timing) => {
                          const entry = item.entries.find(
                            (value) =>
                              value.day === day &&
                              (String(value.timingId || "") ===
                                String(timing._id || "") ||
                                (value.startTime === timing.startTime &&
                                  value.endTime === timing.endTime)),
                          );
                          return (
                            <td
                              key={cellKey(day, timing)}
                              className={`p-2 text-center ${timing.type !== "period" ? "bg-slate-50" : ""}`}
                            >
                              {timing.type !== "period" ? (
                                timing.label
                              ) : entry ? (
                                <>
                                  <b>{label(entry.subjectId)}</b>
                                  <small className="block text-slate-500">
                                    {label(entry.teacherId)}
                                  </small>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 space-y-4 md:hidden">
                {settings.workingDays.map((day) => {
                  const entries = item.entries.filter((entry) => entry.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
                  return <section key={day} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><h3 className="text-sm font-bold text-slate-800">{day}</h3><div className="mt-2 space-y-2">{entries.length ? entries.map((entry) => <div key={entry._id || `${entry.day}-${entry.startTime}`} className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{label(entry.subjectId)}</p><p className="mt-1 text-xs text-slate-500">{label(item.courseId)} · {label(item.sectionId)}</p></div><span className="shrink-0 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">{settings.timings.find((timing) => String(timing._id || "") === String(entry.timingId || "") || (timing.startTime === entry.startTime && timing.endTime === entry.endTime))?.label || "Period"}</span></div><p className="mt-2 text-xs font-medium text-slate-600">{formatTime12(entry.startTime)}–{formatTime12(entry.endTime)}</p></div>) : <p className="rounded-lg bg-white p-3 text-xs text-slate-500">No assigned periods</p>}</div></section>;
                })}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-white p-8 text-center text-slate-500">
            No published timetable available.
          </p>
        )}
      </div>
    </section>
  );
}

function SettingsPanel({
  value,
  setValue,
  close,
  save,
}: {
  value: Settings;
  setValue: (value: Settings) => void;
  close: () => void;
  save: () => void;
}) {
  const updateTiming = (index: number, changes: Partial<Timing>) =>
    setValue({
      ...value,
      timings: value.timings.map((timing, i) =>
        i === index ? { ...timing, ...changes } : timing,
      ),
    });
  const teachingCount = value.timings.filter(
    (timing) => timing.type === "period",
  ).length;
  const renumberPeriods = (timings: Timing[]) => {
    let period = 0;
    return timings.map((timing) =>
      timing.type === "period"
        ? { ...timing, label: `Period ${++period}` }
        : timing,
    );
  };
  const addPeriod = () => {
    if (teachingCount >= 12) return;
    const start = value.timings[value.timings.length - 1]?.endTime || "16:00";
    const minutes =
      Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + 45;
    const endTime = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    setValue({
      ...value,
      timings: renumberPeriods([
        ...value.timings,
        { label: "New period", startTime: start, endTime, type: "period" },
      ]),
    });
  };
  const removePeriod = (index: number) => {
    if (teachingCount <= 1) return;
    setValue({
      ...value,
      timings: renumberPeriods(
        value.timings.filter((_, timingIndex) => timingIndex !== index),
      ),
    });
  };
  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">College timetable schedule</h2>
          <p className="text-sm text-slate-500">
            Add or remove teaching periods here. The same period columns and
            1-hour midday break are shown on every enabled working day.
          </p>
        </div>
        <button onClick={close}>
          <X />
        </button>
      </div>
      {value.locked && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
          Settings are locked because section timetables already exist.
        </p>
      )}
      <div className="mt-5">
        <b className="text-sm">Working days</b>
        <div className="mt-2 flex flex-wrap gap-3">
          {allDays.map((day) => (
            <label key={day} className="text-sm">
              <input
                disabled={value.locked}
                type="checkbox"
                checked={value.workingDays.includes(day)}
                onChange={(event) =>
                  setValue({
                    ...value,
                    workingDays: event.target.checked
                      ? [...value.workingDays, day]
                      : value.workingDays.filter((item) => item !== day),
                  })
                }
              />{" "}
              {day}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {value.timings.map((timing, index) => (
          <div
            key={timing._id || index}
            className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-5"
          >
            <input
              disabled={value.locked}
              value={timing.label}
              onChange={(e) => updateTiming(index, { label: e.target.value })}
              placeholder="Label"
              className="rounded-lg border p-2 text-sm"
            />
            <input
              disabled={value.locked}
              type="time"
              value={timing.startTime}
              onChange={(e) =>
                updateTiming(index, { startTime: e.target.value })
              }
              className="rounded-lg border p-2 text-sm"
            />
            <input
              disabled={value.locked}
              type="time"
              value={timing.endTime}
              onChange={(e) => updateTiming(index, { endTime: e.target.value })}
              className="rounded-lg border p-2 text-sm"
            />
            <div
              className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${timing.type === "lunch" ? "bg-amber-100 text-amber-700" : "bg-white text-slate-600"}`}
            >
              {timing.type === "lunch"
                ? "1-hour midday break"
                : "Teaching period"}
            </div>
            {timing.type === "period" ? (
              <button
                disabled={value.locked || teachingCount <= 1}
                onClick={() => removePeriod(index)}
                className="flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 disabled:opacity-40"
              >
                <Trash2 size={16} /> Remove
              </button>
            ) : (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
                Break is protected
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-3">
        <button
          disabled={value.locked || teachingCount >= 12}
          onClick={addPeriod}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Add period
        </button>
        <button
          disabled={value.locked}
          onClick={save}
          className="ml-auto rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save schedule
        </button>
      </div>
    </section>
  );
}
