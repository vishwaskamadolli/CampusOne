"use client";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  Layers3,
  ListFilter,
  LoaderCircle,
  Search,
  Save,
  Settings2,
  Trash2,
  UsersRound,
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
    if (items.length) {
      loadIntoGrid(items[0]);
      return;
    }
    const defaultSection = refs.sections?.[0];
    const first = {
      academicYearId: refs["academic-years"][0]._id,
      courseId: id(defaultSection?.courseId) || refs.classes[0]._id,
      departmentId:
        id(defaultSection?.departmentId) || refs.streams[0]._id,
      sectionId: defaultSection?._id || "",
    };
    setSelection(first);
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
  const existingTimetableOptions = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        name: `${label(item.courseId)} · ${label(item.departmentId)} · ${label(item.sectionId)}`,
        code: `${label(item.academicYearId)} · ${item.status}`,
      })),
    [items],
  );

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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {items.length > 0 && (
            <div className="sm:w-72">
              <SearchableSelect
                id="existing-timetable-filter"
                title="Existing timetables"
                value={editing?._id || ""}
                options={existingTimetableOptions}
                icon={<ListFilter size={17} />}
                searchPlaceholder="Search existing timetables..."
                onChange={(value) => {
                  const timetable = items.find((item) => item._id === value);
                  if (timetable) loadIntoGrid(timetable);
                }}
              />
            </div>
          )}
          <button
            onClick={() => {
              if (settingsOpen) setSettingsOpen(false);
              else {
                setSettingsDraft(structuredClone(settings));
                setSettingsOpen(true);
              }
            }}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold"
          >
            <Settings2 size={17} />
            {settingsOpen
              ? "Hide schedule settings"
              : "College schedule settings"}
          </button>
        </div>
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
      <div className="mb-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            {
              key: "academicYearId",
              title: "Academic Year",
              resource: "academic-years",
              icon: <CalendarClock size={17} />,
              searchPlaceholder: "Search academic years...",
            },
            {
              key: "courseId",
              title: "Class",
              resource: "classes",
              icon: <BookOpen size={17} />,
              searchPlaceholder: "Search classes...",
            },
            {
              key: "departmentId",
              title: "Stream",
              resource: "streams",
              icon: <Layers3 size={17} />,
              searchPlaceholder: "Search streams...",
            },
            {
              key: "sectionId",
              title: "Section",
              resource: "sections",
              icon: <UsersRound size={17} />,
              searchPlaceholder: "Search sections...",
            },
          ] as {
            key: keyof Selection;
            title: string;
            resource: string;
            icon: ReactNode;
            searchPlaceholder: string;
          }[]
        ).map(({ key, title, resource, icon, searchPlaceholder }) => {
          const options =
            key === "sectionId" ? validSections : refs[resource] || [];
          return (
            <SearchableSelect
              key={key}
              id={`timetable-${key}`}
              title={title}
              value={selection[key]}
              options={options}
              icon={icon}
              searchPlaceholder={searchPlaceholder}
              onChange={(value) => selectAcademic(key, value)}
            />
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
    </section>
  );
}

function SearchableSelect({
  id,
  title,
  value,
  options,
  icon,
  searchPlaceholder,
  onChange,
}: {
  id: string;
  title: string;
  value: string;
  options: Item[];
  icon: ReactNode;
  searchPlaceholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option._id === value);
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return options;
    return options.filter((option) =>
      [
        label(option),
        option.code,
        option.courseId?.name,
        option.departmentId?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [options, query]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function choose(option: Item) {
    onChange(option._id);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function handleSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, filteredOptions.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label
        id={`${id}-label`}
        className="mb-2 block text-xs font-semibold tracking-wide text-slate-600"
      >
        {title}
      </label>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-controls={`${id}-listbox`}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
          setActiveIndex(0);
        }}
        className={`group flex h-14 w-full items-center gap-3 rounded-xl border bg-white px-3 text-left shadow-sm transition duration-200 focus:outline-none focus:ring-4 ${
          open
            ? "border-brand-500 ring-4 ring-brand-100"
            : "border-slate-200 hover:border-slate-300 hover:shadow"
        }`}
      >
        <span
          aria-hidden="true"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
            open
              ? "bg-brand-100 text-brand-700"
              : "bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-700"
          }`}
        >
          {icon}
        </span>
        <span
          id={`${id}-value`}
          className={`min-w-0 flex-1 truncate text-sm font-semibold ${
            selected ? "text-slate-800" : "text-slate-400"
          }`}
        >
          {selected ? label(selected) : `Select ${title}`}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={17}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-brand-600" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.16)] ring-1 ring-slate-900/5">
          <div className="px-2 pb-2 pt-1">
            <p className="text-xs font-semibold text-slate-700">
              Choose {title.toLowerCase()}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {options.length} {options.length === 1 ? "option" : "options"}{" "}
              available
            </p>
          </div>
          <div className="relative mb-2">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={`${id}-listbox`}
              aria-activedescendant={
                filteredOptions[activeIndex]
                  ? `${id}-option-${filteredOptions[activeIndex]._id}`
                  : undefined
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="max-h-60 space-y-1 overflow-y-auto"
          >
            {filteredOptions.length ? (
              filteredOptions.map((option, index) => {
                const isSelected = option._id === value;
                const isActive = index === activeIndex;
                const detail =
                  option.code ||
                  [
                    option.courseId?.name,
                    option.departmentId?.name,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                return (
                  <button
                    id={`${id}-option-${option._id}`}
                    key={option._id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                      isSelected
                        ? "bg-brand-50"
                        : isActive
                          ? "bg-slate-50"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${
                        isSelected
                          ? "bg-brand-100 text-brand-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {label(option).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700">
                        {label(option)}
                      </span>
                      {detail && (
                        <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                          {detail}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check
                        aria-hidden="true"
                        size={16}
                        className="shrink-0 text-brand-600"
                      />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-8 text-center">
                <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-400">
                  <Search size={16} />
                </span>
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {options.length ? "No matches found" : `No ${title.toLowerCase()} options`}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {options.length
                    ? "Try another search."
                    : "Options will appear here when available."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CompactSelect({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
}: {
  ariaLabel: string;
  value: string;
  options: { value: string; label: string; description?: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const menuId = `timetable-option-list-${useId()}`;

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxHeight = Math.min(280, window.innerHeight - 24);
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const top =
        spaceBelow < Math.min(180, maxHeight) &&
        rect.top > spaceBelow
          ? Math.max(8, rect.top - maxHeight - 6)
          : rect.bottom + 6;
      const width = Math.max(rect.width, 180);
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - width - 8),
      );
      setPosition({ top, left, width, maxHeight });
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(option: { value: string; label: string }) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`group flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-xs font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand-100 ${
          disabled
            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 shadow-none"
            : open
              ? "border-brand-400 bg-brand-50/60 text-brand-800"
              : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40"
        } ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected?.label || options[0]?.label || "Choose"}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={14}
          className={`shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180 text-brand-600" : ""
          }`}
        />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
            className="z-[100] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/5"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value || "empty"}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(option)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                    isSelected
                      ? "bg-brand-50 text-brand-800"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check
                      aria-hidden="true"
                      size={14}
                      className="shrink-0 text-brand-600"
                    />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
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
                const subjectOptions = [
                  { value: "", label: "Free period" },
                  ...subjects.map((subject) => ({
                    value: subject._id,
                    label: label(subject),
                    description: subject.code || undefined,
                  })),
                ];
                const teacherOptions = [
                  { value: "", label: "Select teacher" },
                  ...eligible.map((teacher) => ({
                    value: teacher._id,
                    label: label(teacher),
                    description: teacher.employeeNumber || undefined,
                  })),
                ];
                return (
                  <td key={key} className="border-b border-r p-2 align-top">
                    <CompactSelect
                      ariaLabel={`${day} ${timing.label} subject`}
                      value={subjectId}
                      options={subjectOptions}
                      onChange={(value) =>
                        updateCell(day, timing, {
                          subjectId: value,
                          teacherId: "",
                          subjectOverride: false,
                        })
                      }
                    />
                    <CompactSelect
                      ariaLabel={`${day} ${timing.label} teacher`}
                      value={id(entry?.teacherId)}
                      options={teacherOptions}
                      disabled={!subjectId}
                      onChange={(value) =>
                        updateCell(day, timing, { teacherId: value })
                      }
                      className="mt-2"
                    />
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
