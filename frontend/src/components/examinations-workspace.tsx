"use client";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, ChevronDown, Clock, Download, Eye, FileSpreadsheet, GraduationCap, Layers3, ListFilter, LoaderCircle, Pencil, Plus, Search, Sparkles, Trash2, Upload, UsersRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { toastAction, toastError } from "@/lib/toast";
import { Pagination, usePagination } from "@/components/pagination";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";
import { FormModal, FormSectionHeading } from "@/components/form-modal";
import { createPortal } from "react-dom";

type Item = Record<string, any> & { _id: string; name?: string };
const id = (value: any) => String(value?._id || value || "");
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const dateValue = (value: any) => value ? new Date(value).toISOString().slice(0, 10) : "";
const readDate = (value: any) => value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === "number" ? (()=>{const d=XLSX.SSF.parse_date_code(value);return d?`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`:""})() : String(value||"").slice(0,10);
const readTime = (value: any) => typeof value === "number" ? (()=>{const m=Math.round((value%1)*1440);return `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`})() : String(value||"").slice(0,5);

export function ExaminationsWorkspace() {
  const [exams,setExams]=useState<Item[]>([]), [refs,setRefs]=useState<Record<string,Item[]>>({}), [loading,setLoading]=useState(true);
  const [query,setQuery]=useState(""), [status,setStatus]=useState("all"), [createOpen,setCreateOpen]=useState(false), [editing,setEditing]=useState<Item|null>(null), [selected,setSelected]=useState<Item|null>(null);
  const load=useCallback(async()=>{setLoading(true);try{const names=["academic-years","classes","streams","sections","stream-subjects"];const [examRows,...values]=await Promise.all([api<Item[]>("/examinations"),...names.map(name=>api<Item[]>(`/academics/${name}`))]);setExams(examRows);setRefs(Object.fromEntries(names.map((name,index)=>[name,values[index]])));setSelected(current=>current?examRows.find(exam=>exam._id===current._id)||null:null);}catch(error){toastError(error)}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const filtered=useMemo(()=>exams.filter(exam=>(!query||`${exam.name} ${exam.courseId?.name} ${exam.departmentId?.name} ${exam.sectionId?.name}`.toLowerCase().includes(query.toLowerCase()))&&(status==="all"||(status==="timetable"?exam.timetableStatus==="published":status==="results"?exam.status==="published":exam.status!=="published"))),[exams,query,status]);
  const pagination=usePagination(filtered);
  const statusOptions: SearchableSelectOption[]=[
    {value:"all",label:"All examinations",description:"Show every examination",},
    {value:"timetable",label:"Published timetables",description:"Examinations with a published timetable",},
    {value:"results",label:"Published results",description:"Examinations with published results",},
    {value:"draft",label:"Results not published",description:"Examinations still awaiting result publication",},
  ];
  if(selected)return <ExamDetail exam={selected} refs={refs} onBack={()=>setSelected(null)} onRefresh={load}/>;
  const cards=[{label:"Total examinations",value:exams.length,icon:CalendarDays},{label:"Published timetables",value:exams.filter(x=>x.timetableStatus==="published").length,icon:Clock},{label:"Published results",value:exams.filter(x=>x.status==="published").length,icon:CheckCircle2},{label:"Results awaiting publication",value:exams.filter(x=>x.status==="review").length,icon:FileSpreadsheet}];
  return <section>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-brand-700">ACADEMIC ASSESSMENT</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Examinations</h1><p className="mt-1 text-sm text-slate-500">Create examination schedules and publish verified student results.</p></div><button onClick={()=>setCreateOpen(true)} className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"><Plus size={18}/>Create Examination</button></header>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({label,value,icon:Icon})=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><span className="rounded-xl bg-brand-50 p-2 text-brand-700"><Icon size={18}/></span></div><p className="mt-3 text-2xl font-bold">{value}</p></article>)}</div>
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-soft"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={17}/><input className={`${field} pl-9`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search examinations, classes or streams"/></label><SearchableSelect label="Filter examinations" value={status} options={statusOptions} onChange={setStatus} placeholder="All examinations" searchPlaceholder="Search filters..." icon={<ListFilter size={16}/>} className="sm:w-64"/></div>
      {loading?<Skeleton/>:filtered.length===0?<Empty title="No examinations found" text="Create an examination or adjust the current search and filter."/>:<><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Examination</th><th>Academic structure</th><th>Date range</th><th>Timetable</th><th>Results</th><th className="pr-5 text-right">Actions</th></tr></thead><tbody>{pagination.paginatedItems.map(exam=><ExamRow key={exam._id} exam={exam} view={()=>setSelected(exam)} edit={()=>setEditing(exam)}/>)}</tbody></table></div><div className="divide-y md:hidden">{pagination.paginatedItems.map(exam=><ExamCard key={exam._id} exam={exam} view={()=>setSelected(exam)} edit={()=>setEditing(exam)}/>)}</div><Pagination page={pagination.page} pageCount={pagination.pageCount} pageSize={pagination.pageSize} total={filtered.length} onPageChange={pagination.setPage} onPageSizeChange={(size)=>{pagination.setPageSize(size);pagination.setPage(1)}}/></>}
    </div>
    {(createOpen||editing)&&<ExamModal refs={refs} exam={editing||undefined} close={()=>{setCreateOpen(false);setEditing(null)}} saved={async()=>{setCreateOpen(false);setEditing(null);await load()}}/>}
  </section>;
}

function ExamRow({exam,view,edit}:{exam:Item;view:()=>void;edit:()=>void}){return <tr className="border-t border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{exam.name}</p><p className="mt-1 text-xs text-slate-500">{exam.academicYearId?.name}</p></td><td>{exam.courseId?.name} · {exam.departmentId?.name}<p className="text-xs text-slate-500">Section {exam.sectionId?.name||"—"}</p></td><td>{dateValue(exam.startDate)}<span className="mx-1 text-slate-400">–</span>{dateValue(exam.endDate)}</td><td><Badge published={exam.timetableStatus==="published"} label={exam.timetableStatus||"draft"}/></td><td><Badge published={exam.status==="published"} label={exam.status==="review"?"Draft results":exam.status}/></td><td className="pr-5 text-right"><button onClick={view} className="mr-2 rounded-lg border p-2 text-slate-600" aria-label="View"><Eye size={16}/></button><button onClick={edit} className="rounded-lg border p-2 text-slate-600" aria-label="Edit"><Pencil size={16}/></button></td></tr>}
function ExamCard({exam,view,edit}:{exam:Item;view:()=>void;edit:()=>void}){return <article className="p-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{exam.name}</h3><p className="mt-1 text-sm text-slate-500">{exam.courseId?.name} · {exam.departmentId?.name} · {exam.sectionId?.name}</p></div><button onClick={view} className="rounded-lg border p-2"><Eye size={17}/></button></div><p className="mt-3 text-xs text-slate-500">{dateValue(exam.startDate)} – {dateValue(exam.endDate)}</p><div className="mt-3 flex gap-2"><Badge published={exam.timetableStatus==="published"} label={`Timetable: ${exam.timetableStatus||"draft"}`}/><Badge published={exam.status==="published"} label={`Results: ${exam.status}`}/><button onClick={edit} className="ml-auto text-sm font-semibold text-brand-700">Edit</button></div></article>}
function Badge({published,label}:{published:boolean;label:string}){return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${published?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{label}</span>}
function Skeleton(){return <div className="space-y-3 p-5">{[1,2,3,4].map(x=><div key={x} className="h-14 animate-pulse rounded-xl bg-slate-100"/>)}</div>}
function Empty({title,text}:{title:string;text:string}){return <div className="p-12 text-center"><CalendarDays className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>}

function ExamModal({
  refs,
  exam,
  close,
  saved,
}: {
  refs: Record<string, Item[]>;
  exam?: Item;
  close: () => void;
  saved: () => void;
}) {
  const editing = Boolean(exam),
    [form, setForm] = useState({
      name: exam?.name || "",
      academicYearId: id(exam?.academicYearId),
      courseId: id(exam?.courseId),
      departmentId: id(exam?.departmentId),
      sectionId: id(exam?.sectionId),
      startDate: dateValue(exam?.startDate),
      endDate: dateValue(exam?.endDate),
    }),
    [rows, setRows] = useState<any[]>([]),
    [file, setFile] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(""),
    [templatesOpen, setTemplatesOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const templateTriggerRef = useRef<HTMLButtonElement>(null);
  const templateOptionsRef = useRef<HTMLDivElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [templateMenuPosition, setTemplateMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const sections = (refs.sections || []).filter(
      (x) =>
        id(x.courseId) === form.courseId &&
        id(x.departmentId) === form.departmentId,
    ),
    complete = Object.values(form).every(Boolean);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      const book = XLSX.read(await selected.arrayBuffer(), {
          type: "array",
          cellDates: true,
        }),
        raw = XLSX.utils.sheet_to_json<Record<string, any>>(
          book.Sheets[book.SheetNames[0]],
          { defval: "" },
        );
      setRows(
        raw.map((r) => ({
          subject: r.Subject,
          date: readDate(r["Exam Date"]),
          startTime: readTime(r["Start Time"]),
          endTime: readTime(r["End Time"]),
          maxMarks: r["Max Marks"],
        })),
      );
      setFile(selected.name);
      setPreview(null);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to read file",
      );
    }
  }
  async function validate() {
    try {
      setPreview(
        await api("/examinations/timetable-preview", {
          method: "POST",
          body: JSON.stringify({ ...form, rows }),
        }),
      );
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Validation failed");
    }
  }
  async function save() {
    try {
      if (editing) {
        await toastAction(
          () =>
            api(`/examinations/${exam!._id}`, {
              method: "PATCH",
              body: JSON.stringify(form),
            }),
          { loading: "Saving examination…", success: "Examination updated" },
        );
      } else {
        await toastAction(
          () =>
            api("/examinations/with-timetable", {
              method: "POST",
              body: JSON.stringify({ ...form, rows }),
            }),
          { loading: "Creating examination…", success: "Examination created" },
        );
      }
      saved();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save examination",
      );
    }
  }
  const academicYearOptions: SearchableSelectOption[] = (
    refs["academic-years"] || []
  ).map((item) => ({
    value: item._id,
    label: item.name || item._id,
    description: "Academic year",
  }));
  const classOptions: SearchableSelectOption[] = (refs.classes || []).map(
    (item) => ({
      value: item._id,
      label: item.name || item._id,
      description: "Class",
    }),
  );
  const streamOptions: SearchableSelectOption[] = (refs.streams || []).map(
    (item) => ({
      value: item._id,
      label: item.name || item._id,
      description: "Stream",
    }),
  );
  const sectionOptions: SearchableSelectOption[] = sections.map((item) => ({
    value: item._id,
    label: item.name || item._id,
    description: [item.courseId?.name, item.departmentId?.name]
      .filter(Boolean)
      .join(" · ") || "Section",
  }));
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100";
  useEffect(() => {
    if (!templatesOpen) {
      setTemplateMenuPosition(null);
      return;
    }
    function updatePosition() {
      const rect = templateTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = 104;
      const menuWidth = 208;
      const top =
        window.innerHeight - rect.bottom >= menuHeight + 8
          ? rect.bottom + 6
          : Math.max(8, rect.top - menuHeight - 6);
      const left = Math.max(
        8,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
      );
      setTemplateMenuPosition({ top, left });
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !templateMenuRef.current?.contains(target) &&
        !templateOptionsRef.current?.contains(target) &&
        !templateTriggerRef.current?.contains(target)
      ) {
        setTemplatesOpen(false);
      }
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [templatesOpen]);

  return (
    <FormModal
      titleId="exam-modal-title"
      title={editing ? "Edit examination" : "Create an examination"}
      description={
        editing
          ? "Update the examination details and academic cohort."
          : "Set up the assessment, choose its cohort, and prepare the timetable."
      }
      icon={editing ? <FileSpreadsheet size={24} /> : <GraduationCap size={24} />}
      onClose={close}
      maxWidth="max-w-4xl"
    >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <FormSectionHeading
              icon={<BookOpen size={18} />}
              title="Examination details"
              description="Name the assessment and assign its academic group."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Examination name">
                <input
                  required
                  className={inputClass}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="e.g. Mid-term examination"
                />
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-700">
                  Academic year
                </p>
                <SearchableSelect
                  label="Academic year"
                  value={form.academicYearId}
                  options={academicYearOptions}
                  onChange={(value) =>
                    setForm({ ...form, academicYearId: value })
                  }
                  placeholder="Choose academic year"
                  searchPlaceholder="Search academic years..."
                  icon={<CalendarDays size={16} />}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-700">
                  Class
                </p>
                <SearchableSelect
                  label="Class"
                  value={form.courseId}
                  options={classOptions}
                  onChange={(value) =>
                    setForm({ ...form, courseId: value, sectionId: "" })
                  }
                  placeholder="Choose class"
                  searchPlaceholder="Search classes..."
                  icon={<GraduationCap size={16} />}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-700">
                  Stream
                </p>
                <SearchableSelect
                  label="Stream"
                  value={form.departmentId}
                  options={streamOptions}
                  onChange={(value) =>
                    setForm({ ...form, departmentId: value, sectionId: "" })
                  }
                  placeholder="Choose stream"
                  searchPlaceholder="Search streams..."
                  icon={<Layers3 size={16} />}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-700">
                  Section
                </p>
                <SearchableSelect
                  label="Section"
                  value={form.sectionId}
                  options={sectionOptions}
                  onChange={(value) => setForm({ ...form, sectionId: value })}
                  placeholder={
                    form.courseId && form.departmentId
                      ? "Choose section"
                      : "Choose class and stream first"
                  }
                  searchPlaceholder="Search sections..."
                  icon={<UsersRound size={16} />}
                />
              </div>
            </div>
            {form.courseId && form.departmentId && (
              <p className="mt-3 rounded-xl bg-brand-50/70 px-3.5 py-2.5 text-xs text-brand-800">
                Sections are filtered to match the selected class and stream.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <FormSectionHeading
              icon={<Clock size={18} />}
              title="Examination period"
              description="Choose the first and last day of the examination."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <input
                  type="date"
                  required
                  className={inputClass}
                  value={form.startDate}
                  onChange={(event) =>
                    setForm({ ...form, startDate: event.target.value })
                  }
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  required
                  className={inputClass}
                  value={form.endDate}
                  onChange={(event) =>
                    setForm({ ...form, endDate: event.target.value })
                  }
                />
              </Field>
            </div>
          </section>

          {!editing && (
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white p-4 sm:p-5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <FileSpreadsheet size={17} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Examination timetable
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Choose the timetable file you filled in. Excel and CSV
                    files are supported.
                  </p>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="relative w-fit" ref={templateMenuRef}>
                  <button
                    ref={templateTriggerRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={templatesOpen}
                    onClick={() => setTemplatesOpen((current) => !current)}
                    className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                  >
                    <Upload size={17} />
                    Upload timetable
                    <ChevronDown
                      size={15}
                      className={`transition-transform ${templatesOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={upload}
                  />
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={upload}
                  />
                  {templatesOpen &&
                    templateMenuPosition &&
                    createPortal(
                      <div
                        ref={templateOptionsRef}
                        role="menu"
                        style={{
                          position: "fixed",
                          top: templateMenuPosition.top,
                          left: templateMenuPosition.left,
                        }}
                        className="z-[100] w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setTemplatesOpen(false);
                            excelInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-brand-50"
                        >
                          <FileSpreadsheet size={16} className="text-brand-600" />
                          Upload Excel timetable
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setTemplatesOpen(false);
                            csvInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-brand-50"
                        >
                          <FileSpreadsheet size={16} className="text-brand-600" />
                          Upload CSV timetable
                        </button>
                      </div>,
                      document.body,
                    )}
                </div>

                {file && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm">
                      <FileSpreadsheet size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700">
                        {file}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {rows.length} timetable{" "}
                        {rows.length === 1 ? "entry" : "entries"} loaded
                      </span>
                    </span>
                    <CheckCircle2
                      size={17}
                      className="shrink-0 text-emerald-600"
                    />
                  </div>
                )}

                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={validate}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    <CheckCircle2 size={15} />
                    Preview and validate timetable
                  </button>
                )}
                {preview && <PreviewTable preview={preview} />}
              </div>
            </section>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              !complete || (!editing && (!preview || preview.errors.length))
            }
            onClick={save}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editing ? <CheckCircle2 size={16} /> : <GraduationCap size={17} />}
            {editing ? "Save changes" : "Create examination"}
          </button>
        </footer>
    </FormModal>
  );
}

function ExamDetail({exam,refs,onBack,onRefresh}:{exam:Item;refs:Record<string,Item[]>;onBack:()=>void;onRefresh:()=>Promise<void>}){const [tab,setTab]=useState<"timetable"|"results">("timetable");return <section><button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={17}/>Back to examinations</button><div className="mt-4 rounded-2xl border bg-white p-5 shadow-soft"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h1 className="text-2xl font-bold">{exam.name}</h1><p className="mt-1 text-sm text-slate-500">{exam.academicYearId?.name} · {exam.courseId?.name} · {exam.departmentId?.name} · Section {exam.sectionId?.name}</p></div><div className="flex gap-2"><Badge published={exam.timetableStatus==="published"} label={`Timetable ${exam.timetableStatus}`}/><Badge published={exam.status==="published"} label={`Results ${exam.status}`}/></div></div><nav className="mt-6 flex gap-1 border-b"><button onClick={()=>setTab("timetable")} className={`px-4 py-3 text-sm font-semibold ${tab==="timetable"?"border-b-2 border-brand-600 text-brand-700":"text-slate-500"}`}>Exam Timetable</button><button onClick={()=>setTab("results")} className={`px-4 py-3 text-sm font-semibold ${tab==="results"?"border-b-2 border-brand-600 text-brand-700":"text-slate-500"}`}>Results</button></nav>{tab==="timetable"?<TimetablePanel exam={exam} refs={refs} refresh={onRefresh}/>:<ResultsPanel exam={exam} refresh={onRefresh}/>}</div></section>}

function TimetablePanel({exam,refs,refresh}:{exam:Item;refs:Record<string,Item[]>;refresh:()=>Promise<void>}){const [editing,setEditing]=useState<any>(null),[confirm,setConfirm]=useState<any>(null);const subjects=(refs["stream-subjects"]||[]).filter(x=>id(x.streamId)===id(exam.departmentId)).map(x=>x.subjectId);async function save(){await toastAction(()=>api(`/examinations/${exam._id}/timetable/${editing._id}`,{method:"PATCH",body:JSON.stringify(editing)}),{loading:"Saving timetable…",success:"Timetable updated"});setEditing(null);await refresh()}async function remove(){await toastAction(()=>api(`/examinations/${exam._id}/timetable/${confirm._id}`,{method:"DELETE"}),{loading:"Deleting entry…",success:"Timetable entry deleted"});setConfirm(null);await refresh()}return <div className="py-5"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-3">Subject</th><th>Exam date</th><th>Start time</th><th>End time</th><th>Maximum marks</th><th className="text-right">Actions</th></tr></thead><tbody>{(exam.timetableEntries||[]).map((entry:any)=><tr key={entry._id} className="border-b last:border-0"><td className="p-3 font-semibold">{entry.subjectId?.name}</td><td>{new Date(entry.date).toLocaleDateString("en-IN")}</td><td>{entry.startTime}</td><td>{entry.endTime}</td><td>{entry.maxMarks}</td><td className="text-right"><button onClick={()=>setEditing({...entry,subjectId:id(entry.subjectId),date:dateValue(entry.date)})} className="mr-2 rounded-lg border p-2"><Pencil size={15}/></button><button onClick={()=>setConfirm(entry)} className="rounded-lg border p-2 text-rose-600"><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>{!exam.timetableEntries?.length&&<Empty title="No timetable entries" text="This examination does not yet have a timetable."/>}{editing&&<div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"><select className={field} value={editing.subjectId} onChange={e=>setEditing({...editing,subjectId:e.target.value})}>{subjects.map((x:any)=><option key={x._id} value={x._id}>{x.name}</option>)}</select><input className={field} type="date" value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value})}/><input className={field} type="number" value={editing.maxMarks} onChange={e=>setEditing({...editing,maxMarks:Number(e.target.value)})}/><input className={field} type="time" value={editing.startTime} onChange={e=>setEditing({...editing,startTime:e.target.value})}/><input className={field} type="time" value={editing.endTime} onChange={e=>setEditing({...editing,endTime:e.target.value})}/><div className="flex gap-2"><button onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save</button><button onClick={()=>setEditing(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button></div></div>}{confirm&&<Confirm title="Delete timetable entry?" text={`${confirm.subjectId?.name} will be removed immediately.`} close={()=>setConfirm(null)} confirm={remove}/>}</div>}

function ResultsPanel({exam,refresh}:{exam:Item;refresh:()=>Promise<void>}){const [file,setFile]=useState(""),[rows,setRows]=useState<any[]>([]),[preview,setPreview]=useState<any>(null),[error,setError]=useState("");const selection={academicYearId:id(exam.academicYearId),examinationId:exam._id,courseId:id(exam.courseId),departmentId:id(exam.departmentId),sectionId:id(exam.sectionId)};async function context(){return api<{subjects:Item[];rows:any[]}>("/results/import-template",{method:"POST",body:JSON.stringify(selection)})}async function template(format:"csv"|"xlsx"){try{const data=await context(),sheet=XLSX.utils.json_to_sheet(data.rows.map(r=>({"Admission Number":r.admissionNumber,"Student Name":r.studentName,...Object.fromEntries(data.subjects.map(s=>[s.code,""]))}))),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Results");XLSX.writeFile(book,`${exam.name}-results.${format}`,{bookType:format})}catch(reason){setError(reason instanceof Error?reason.message:"Unable to download template")}}async function upload(event:ChangeEvent<HTMLInputElement>){const selected=event.target.files?.[0];if(!selected)return;try{const data=await context(),book=XLSX.read(await selected.arrayBuffer(),{type:"array"}),raw=XLSX.utils.sheet_to_json<Record<string,any>>(book.Sheets[book.SheetNames[0]],{defval:""});setRows(raw.map(r=>({admissionNumber:r["Admission Number"],studentName:r["Student Name"],marks:Object.fromEntries(data.subjects.map(s=>[s.code,r[s.code]]))})));setFile(selected.name);setPreview(null)}catch(reason){setError(reason instanceof Error?reason.message:"Unable to read results")}}async function validate(){try{setPreview(await api("/results/import-preview",{method:"POST",body:JSON.stringify({...selection,maxMarks:100,rows})}));setError("")}catch(reason){setError(reason instanceof Error?reason.message:"Validation failed")}}async function save(){await toastAction(()=>api("/results/import",{method:"POST",body:JSON.stringify({...selection,maxMarks:100,rows})}),{loading:"Saving draft results…",success:"Draft results saved"});await refresh()}async function publish(){await toastAction(()=>api(`/examinations/${exam._id}/publish-results`,{method:"PATCH"}),{loading:"Publishing results…",success:"Results published"});await refresh()}return <div className="py-5"><div className="rounded-xl border border-dashed bg-slate-50 p-5"><h3 className="font-semibold">Upload student results</h3><p className="mt-1 text-sm text-slate-500">Use the generated roster and subject template to prevent matching errors.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>template("xlsx")} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><Download size={16}/>Excel template</button><button onClick={()=>template("csv")} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">CSV template</button><label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Upload size={16}/>Upload results<input type="file" accept=".xlsx,.csv" className="hidden" onChange={upload}/></label></div>{file&&<p className="mt-3 text-sm">{file} · {rows.length} students</p>}{rows.length>0&&<button onClick={validate} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Preview import</button>}{preview&&<><PreviewTable preview={preview}/><div className="mt-4 flex flex-wrap gap-2"><button disabled={preview.errors.length>0} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save draft results</button><button onClick={publish} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Publish Results</button></div></>}{error&&<p className="mt-3 text-sm text-rose-700">{error}</p>}</div></div>}

function PreviewTable({preview}:{preview:any}){return <div className="mt-4 rounded-xl border bg-white p-4"><p className="text-sm font-semibold">{preview.entries?.length??preview.resultCount??0} valid · {preview.errors?.length||0} errors</p>{preview.errors?.length>0&&<ul className="mt-2 max-h-36 overflow-auto text-sm text-rose-700">{preview.errors.map((e:any,i:number)=><li key={i}>Row {e.row||"—"}: {e.message}</li>)}</ul>}</div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="text-sm font-semibold text-slate-700">{label}<div className="mt-1.5">{children}</div></label>}
function Confirm({title,text,close,confirm}:{title:string;text:string;close:()=>void;confirm:()=>void}){return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 text-sm text-slate-500">{text}</p><div className="mt-6 flex justify-end gap-2"><button onClick={close} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button onClick={confirm} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Delete</button></div></div></div>}
