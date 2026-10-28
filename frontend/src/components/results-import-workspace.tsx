"use client";
import { ChangeEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "@/lib/api";
import { toastAction, toastError } from "@/lib/toast";

type Item = Record<string, any> & { _id: string; name?: string };
type Props = { refs: Record<string, Item[]>; exams: Item[]; onRefresh: () => Promise<void> };
const id = (value: any) => String(value?._id || value || "");
const sheetDate = (value: any) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") { const parsed = XLSX.SSF.parse_date_code(value); return parsed ? `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}` : ""; }
  return String(value || "").trim().slice(0, 10);
};
const sheetTime = (value: any) => {
  if (value instanceof Date) return `${String(value.getUTCHours()).padStart(2,"0")}:${String(value.getUTCMinutes()).padStart(2,"0")}`;
  if (typeof value === "number") { const minutes = Math.round((value % 1) * 24 * 60); return `${String(Math.floor(minutes / 60) % 24).padStart(2,"0")}:${String(minutes % 60).padStart(2,"0")}`; }
  return String(value || "").trim().slice(0, 5);
};

export function ResultsImportWorkspace({ refs, exams, onRefresh }: Props) {
  const [create, setCreate] = useState({ name: "", academicYearId: "", courseId: "", departmentId: "", sectionId: "", startDate: "", endDate: "" });
  const [timetableRows, setTimetableRows] = useState<any[]>([]);
  const [timetableFile, setTimetableFile] = useState("");
  const [timetablePreview, setTimetablePreview] = useState<{ errors: any[]; entries: any[] } | null>(null);
  const [selection, setSelection] = useState({ academicYearId: "", examinationId: "", courseId: "", departmentId: "", sectionId: "" });
  const [maxMarks, setMaxMarks] = useState(100);
  const [rows, setRows] = useState<any[]>([]);
  const [preview, setPreview] = useState<{ errors: any[]; validRows: any[]; studentCount: number; resultCount: number } | null>(null);
  const [fileName, setFileName] = useState("");
  const [editingEntry, setEditingEntry] = useState("");
  const [entry, setEntry] = useState({ subjectId: "", date: "", startTime: "09:00", endTime: "10:00", maxMarks: 100 });
  const sections = (refs.sections || []).filter((item) => id(item.courseId) === selection.courseId && id(item.departmentId) === selection.departmentId);
  const createSections = (refs.sections || []).filter((item) => id(item.courseId) === create.courseId && id(item.departmentId) === create.departmentId);
  const matchingExams = useMemo(() => exams.filter((exam) => id(exam.academicYearId) === selection.academicYearId && id(exam.courseId) === selection.courseId && id(exam.departmentId) === selection.departmentId), [exams, selection.academicYearId, selection.courseId, selection.departmentId]);
  const selectedExam = exams.find((exam) => exam._id === selection.examinationId);
  const mappedSubjects = (refs["stream-subjects"] || []).filter((mapping) => id(mapping.streamId) === selection.departmentId).map((mapping) => mapping.subjectId).filter(Boolean);
  const complete = Object.values(selection).every(Boolean);
  const payload = (extra = {}) => ({ ...selection, maxMarks, rows, ...extra });
  const set = (key: string, value: string) => { setSelection((current) => ({ ...current, [key]: value, ...(key === "academicYearId" || key === "courseId" || key === "departmentId" ? { examinationId: "", sectionId: key === "departmentId" || key === "courseId" ? "" : current.sectionId } : {}) })); setPreview(null); };

  async function context() {
    if (!complete) throw new Error("Select academic year, examination, class, stream, and section");
    return api<{ subjects: Item[]; rows: any[] }>("/results/import-template", { method: "POST", body: JSON.stringify(selection) });
  }
  async function download(format: "csv" | "xlsx") {
    try {
      const data = await context();
      const sheetRows = data.rows.map((row) => ({ "Admission Number": row.admissionNumber, "Student Name": row.studentName, ...Object.fromEntries(data.subjects.map((subject) => [subject.code, ""])) }));
      const sheet = XLSX.utils.json_to_sheet(sheetRows);
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Results");
      XLSX.writeFile(book, `results-template.${format}`, { bookType: format === "csv" ? "csv" : "xlsx" });
    } catch (error) { toastError(error); }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = await context();
      const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(book.Sheets[book.SheetNames[0]], { defval: "" });
      const parsed = raw.map((row) => ({ admissionNumber: row["Admission Number"], studentName: row["Student Name"], marks: Object.fromEntries(data.subjects.map((subject) => [subject.code, row[subject.code]])) }));
      setRows(parsed); setFileName(file.name); setPreview(null);
    } catch (error) { toastError(error); }
  }
  async function validate() {
    try { setPreview(await api("/results/import-preview", { method: "POST", body: JSON.stringify(payload()) })); }
    catch (error) { toastError(error); }
  }
  async function save() {
    await toastAction(() => api("/results/import", { method: "POST", body: JSON.stringify(payload()) }), { loading: "Saving draft results…", success: "Draft results saved" });
    await onRefresh();
  }
  async function publish() {
    if (!selection.examinationId) return toastError(new Error("Select an examination"));
    await toastAction(() => api(`/examinations/${selection.examinationId}/publish-results`, { method: "PATCH" }), { loading: "Publishing results…", success: "Results published" });
    await onRefresh();
  }
  async function saveTimetableEntry() {
    if (!selection.examinationId) return toastError(new Error("Select an examination"));
    await toastAction(() => api(`/examinations/${selection.examinationId}/timetable${editingEntry ? `/${editingEntry}` : ""}`, { method: editingEntry ? "PATCH" : "POST", body: JSON.stringify(entry) }), { loading: "Saving timetable entry…", success: "Timetable entry saved" });
    setEditingEntry(""); setEntry({ subjectId: "", date: "", startTime: "09:00", endTime: "10:00", maxMarks: 100 }); await onRefresh();
  }
  async function removeTimetableEntry(entryId: string) {
    await toastAction(() => api(`/examinations/${selection.examinationId}/timetable/${entryId}`, { method: "DELETE" }), { loading: "Deleting timetable entry…", success: "Timetable entry deleted" }); await onRefresh();
  }
  const createComplete = Object.values(create).every(Boolean);
  async function downloadTimetableTemplate(format: "csv" | "xlsx") {
    try {
      if (!createComplete) throw new Error("Complete the examination details first");
      const data = await api<{ rows: any[] }>("/examinations/timetable-template", { method: "POST", body: JSON.stringify(create) });
      const sheet = XLSX.utils.json_to_sheet(data.rows.map((row) => ({ Subject: row.subject, "Exam Date": row.date, "Start Time": row.startTime, "End Time": row.endTime, "Max Marks": row.maxMarks })));
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Exam Timetable"); XLSX.writeFile(book, `exam-timetable-template.${format}`, { bookType: format });
    } catch (error) { toastError(error); }
  }
  async function uploadTimetable(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(book.Sheets[book.SheetNames[0]], { defval: "" });
      setTimetableRows(raw.map((row) => ({ subject: row.Subject, date: sheetDate(row["Exam Date"]), startTime: sheetTime(row["Start Time"]), endTime: sheetTime(row["End Time"]), maxMarks: row["Max Marks"] })));
      setTimetableFile(file.name); setTimetablePreview(null);
    } catch (error) { toastError(error); }
  }
  async function previewTimetable() {
    try { setTimetablePreview(await api("/examinations/timetable-preview", { method: "POST", body: JSON.stringify({ ...create, rows: timetableRows }) })); }
    catch (error) { toastError(error); }
  }
  async function createExamination() {
    await toastAction(() => api("/examinations/with-timetable", { method: "POST", body: JSON.stringify({ ...create, rows: timetableRows }) }), { loading: "Creating examination…", success: "Examination and timetable created" });
    setCreate({ name: "", academicYearId: "", courseId: "", departmentId: "", sectionId: "", startDate: "", endDate: "" }); setTimetableRows([]); setTimetablePreview(null); setTimetableFile(""); await onRefresh();
  }
  const selectClass = "rounded-lg border border-slate-200 p-2.5 text-sm";
  return <><section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><h2 className="text-lg font-bold">Create Examination</h2><p className="mt-1 text-sm text-slate-500">Enter examination details, upload the timetable, preview it, and save.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-3"><input className={selectClass} placeholder="Examination name" value={create.name} onChange={(e)=>setCreate({...create,name:e.target.value})}/><select className={selectClass} value={create.academicYearId} onChange={(e)=>setCreate({...create,academicYearId:e.target.value})}><option value="">Academic year</option>{(refs["academic-years"]||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select className={selectClass} value={create.courseId} onChange={(e)=>setCreate({...create,courseId:e.target.value,sectionId:""})}><option value="">Class</option>{(refs.classes||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select className={selectClass} value={create.departmentId} onChange={(e)=>setCreate({...create,departmentId:e.target.value,sectionId:""})}><option value="">Stream</option>{(refs.streams||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select className={selectClass} value={create.sectionId} onChange={(e)=>setCreate({...create,sectionId:e.target.value})}><option value="">Section</option>{createSections.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><label className="text-xs font-semibold text-slate-600">Start date<input className={`${selectClass} mt-1 w-full`} type="date" value={create.startDate} onChange={(e)=>setCreate({...create,startDate:e.target.value})}/></label><label className="text-xs font-semibold text-slate-600">End date<input className={`${selectClass} mt-1 w-full`} type="date" value={create.endDate} onChange={(e)=>setCreate({...create,endDate:e.target.value})}/></label></div>
    <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>downloadTimetableTemplate("xlsx")} className="rounded-lg border px-3 py-2 text-sm font-semibold">Download Template (Excel)</button><button onClick={()=>downloadTimetableTemplate("csv")} className="rounded-lg border px-3 py-2 text-sm font-semibold">Download Template (CSV)</button><label className="cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Upload Timetable<input type="file" accept=".xlsx,.csv" className="hidden" onChange={uploadTimetable}/></label>{timetableFile&&<span className="p-2 text-sm text-slate-500">{timetableFile} · {timetableRows.length} entries</span>}</div>
    {timetableRows.length>0&&<button onClick={previewTimetable} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Preview Timetable</button>}
    {timetablePreview&&<div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold">{timetablePreview.entries.length} valid entries · {timetablePreview.errors.length} errors</p>{timetablePreview.errors.length>0&&<ul className="mt-2 text-rose-700">{timetablePreview.errors.map((error,index)=><li key={index}>Row {error.row||"—"}: {error.message}</li>)}</ul>}<button disabled={timetablePreview.errors.length>0} onClick={createExamination} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Save Examination</button></div>}
  </section><section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
    <h2 className="text-lg font-bold">Exam Timetable / Upload Results / Publish Results</h2><p className="mt-1 text-sm text-slate-500">Select an examination to manage its schedule and results.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <select className={selectClass} value={selection.academicYearId} onChange={(e)=>set("academicYearId",e.target.value)}><option value="">Academic year</option>{(refs["academic-years"]||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
      <select className={selectClass} value={selection.courseId} onChange={(e)=>set("courseId",e.target.value)}><option value="">Class</option>{(refs.classes||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
      <select className={selectClass} value={selection.departmentId} onChange={(e)=>set("departmentId",e.target.value)}><option value="">Stream</option>{(refs.streams||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
      <select className={selectClass} value={selection.sectionId} onChange={(e)=>set("sectionId",e.target.value)}><option value="">Section</option>{sections.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
      <select className={selectClass} value={selection.examinationId} onChange={(e)=>set("examinationId",e.target.value)}><option value="">Examination</option>{matchingExams.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
      <label className="text-xs font-semibold text-slate-600">Maximum marks<input className={`${selectClass} mt-1 w-full`} type="number" min="1" max="1000" value={maxMarks} onChange={(e)=>setMaxMarks(Number(e.target.value))}/></label>
    </div>
    {selectedExam&&<div className="mt-6 border-t pt-5"><div className="flex items-center justify-between"><h3 className="font-bold">Exam Timetable</h3></div>
      <div className="mt-3 grid gap-2 md:grid-cols-6"><select className={selectClass} value={entry.subjectId} onChange={(e)=>setEntry({...entry,subjectId:e.target.value})}><option value="">Subject</option>{mappedSubjects.map((subject:Item)=><option key={subject._id} value={subject._id}>{subject.name}</option>)}</select><input className={selectClass} type="date" value={entry.date} onChange={(e)=>setEntry({...entry,date:e.target.value})}/><input className={selectClass} type="time" value={entry.startTime} onChange={(e)=>setEntry({...entry,startTime:e.target.value})}/><input className={selectClass} type="time" value={entry.endTime} onChange={(e)=>setEntry({...entry,endTime:e.target.value})}/><input className={selectClass} type="number" min="1" max="1000" value={entry.maxMarks} onChange={(e)=>setEntry({...entry,maxMarks:Number(e.target.value)})}/><button onClick={saveTimetableEntry} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">{editingEntry?"Update":"Add"}</button></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Subject</th><th>Date</th><th>Time</th><th>Max marks</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(selectedExam.timetableEntries||[]).map((item:any)=><tr key={item._id} className="border-b"><td className="p-2">{item.subjectId?.name}</td><td>{new Date(item.date).toLocaleDateString("en-IN")}</td><td>{item.startTime}–{item.endTime}</td><td>{item.maxMarks}</td><td>{selectedExam.timetableStatus||"draft"}</td><td><button className="mr-3 text-brand-700" onClick={()=>{setEditingEntry(item._id);setEntry({subjectId:id(item.subjectId),date:new Date(item.date).toISOString().slice(0,10),startTime:item.startTime,endTime:item.endTime,maxMarks:item.maxMarks})}}>Edit</button><button className="text-rose-600" onClick={()=>removeTimetableEntry(item._id)}>Delete</button></td></tr>)}</tbody></table>{!selectedExam.timetableEntries?.length&&<p className="p-4 text-center text-slate-500">No timetable entries yet.</p>}</div>
    </div>}
    <div className="mt-6 border-t pt-5"><h3 className="font-bold">Upload Results</h3><p className="mt-1 text-sm text-slate-500">Download the roster template, enter marks, preview validation, then save drafts and publish separately.</p></div>
    <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>download("xlsx")} className="rounded-lg border px-3 py-2 text-sm font-semibold">Download Excel</button><button onClick={()=>download("csv")} className="rounded-lg border px-3 py-2 text-sm font-semibold">Download CSV</button><label className="cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Upload Excel / CSV<input type="file" accept=".xlsx,.csv" className="hidden" onChange={upload}/></label>{fileName&&<span className="p-2 text-sm text-slate-500">{fileName} · {rows.length} rows</span>}</div>
    {rows.length>0&&<button onClick={validate} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Preview import</button>}
    {preview&&<div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold">{preview.studentCount} students · {preview.resultCount} valid subject results · {preview.errors.length} errors</p>{preview.errors.length>0&&<ul className="mt-2 max-h-40 overflow-auto text-rose-700">{preview.errors.map((error,index)=><li key={index}>Row {error.row || "—"}: {error.message}</li>)}</ul>}<div className="mt-4 flex gap-2"><button disabled={preview.errors.length>0} onClick={save} className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Save draft results</button><button onClick={publish} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Publish Results</button></div></div>}
  </section></>;
}
