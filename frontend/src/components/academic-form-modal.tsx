"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Layers3,
  LoaderCircle,
  UsersRound,
} from "lucide-react";
import {
  FormModal,
  FormSectionHeading,
} from "@/components/form-modal";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";

export type FormField = {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "datetime-local"
    | "select"
    | "multiselect"
    | "textarea"
    | "checkbox";
  required?: boolean;
  options?: { label: string; value: string }[];
  createOnly?: boolean;
};

type AcademicRecord = Record<string, unknown> | null;

const formContent: Record<
  string,
  { title: string; description: string; section: string; helper: string }
> = {
  "academic-years": {
    title: "Academic year",
    description: "Set the name and active date range for an academic year.",
    section: "Year details",
    helper: "The date range helps organize academic activity on campus.",
  },
  classes: {
    title: "Class",
    description: "Create or update a class in the academic structure.",
    section: "Class details",
    helper: "Use a clear class name that is easy to recognize.",
  },
  streams: {
    title: "Stream",
    description: "Create or update an academic stream.",
    section: "Stream details",
    helper: "Streams can be assigned to classes, subjects, and students.",
  },
  sections: {
    title: "Section",
    description: "Set up a section and assign it to its academic group.",
    section: "Section details",
    helper: "Choose the class and stream before assigning capacity.",
  },
  subjects: {
    title: "Subject",
    description: "Add a subject and identify its academic category.",
    section: "Subject details",
    helper: "Subject codes help identify subjects across academic records.",
  },
  "stream-subjects": {
    title: "Stream subject",
    description: "Connect a subject to the stream where it is taught.",
    section: "Subject assignment",
    helper: "Select the stream and the subject to create the mapping.",
  },
  "class-teachers": {
    title: "Class teacher",
    description: "Assign a teacher to an academic cohort for the selected year.",
    section: "Teacher assignment",
    helper: "Choose the academic year, class, stream, section, and teacher.",
  },
};

export function AcademicFormModal({
  resource,
  editing,
  fields,
  saving,
  submit,
  close,
  onStructureChange,
}: {
  resource: string;
  editing: AcademicRecord;
  fields: FormField[];
  saving: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  close: () => void;
  onStructureChange: (key: "courseId" | "departmentId", value: string) => void;
}) {
  const content = formContent[resource] || formContent.classes;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields
        .filter((field) => field.type === "select")
        .map((field) => [field.key, initialValue(editing, field.key)]),
    ),
  );
  const [validationError, setValidationError] = useState("");
  const isEditing = Boolean(editing);
  const visibleFields = fields.filter(
    (field) => !field.createOnly || !editing,
  );

  function changeSelect(key: string, value: string) {
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === "courseId" || key === "departmentId"
        ? { sectionId: "" }
        : {}),
    }));
    if (key === "courseId" || key === "departmentId") {
      onStructureChange(key, value);
    }
    setValidationError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const missing = fields.find(
      (field) =>
        field.type === "select" &&
        field.required &&
        !values[field.key],
    );
    if (missing) {
      event.preventDefault();
      setValidationError(`Select ${missing.label.toLowerCase()} to continue.`);
      return;
    }
    setValidationError("");
    submit(event);
  }

  const title = `${isEditing ? "Edit" : "Add"} ${content.title.toLowerCase()}`;
  const icon = iconFor(resource);

  return (
    <FormModal
      titleId="academic-form-title"
      title={title}
      description={content.description}
      icon={icon}
      onClose={close}
      maxWidth="max-w-3xl"
    >
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <FormSectionHeading
              icon={iconFor(resource, 18)}
              title={content.section}
              description={content.helper}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {visibleFields.map((field) => (
                  <AcademicField
                    key={field.key}
                    field={field}
                    editing={editing}
                    value={values[field.key] || ""}
                    onSelect={(value) => changeSelect(field.key, value)}
                    className={
                      visibleFields.length === 1 ? "sm:col-span-2" : ""
                    }
                  />
                ))}
            </div>

            {validationError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {validationError}
              </p>
            )}
          </section>
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
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {saving ? "Saving..." : isEditing ? "Save changes" : "Create record"}
          </button>
        </footer>
      </form>
    </FormModal>
  );
}

function AcademicField({
  field,
  editing,
  value,
  onSelect,
  className = "",
}: {
  field: FormField;
  editing: AcademicRecord;
  value: string;
  onSelect: (value: string) => void;
  className?: string;
}) {
  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-normal text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100";
  const label = (
    <span className="text-xs font-semibold text-slate-600">
      {field.label}
      {field.required && <span className="ml-1 text-rose-500">*</span>}
    </span>
  );

  if (field.type === "select") {
    const options: SearchableSelectOption[] = (field.options || []).map(
      (option) => ({ ...option }),
    );
    return (
      <div className={className}>
        {label}
        <input type="hidden" name={field.key} value={value} />
        <SearchableSelect
          label={field.label}
          value={value}
          options={options}
          onChange={onSelect}
          placeholder={`Choose ${field.label.toLowerCase()}`}
          searchPlaceholder={`Search ${field.label.toLowerCase()}...`}
          icon={iconForField(field.key)}
          className="mt-2"
        />
      </div>
    );
  }

  return (
    <label className={`block ${className}`}>
      {label}
      <input
        name={field.key}
        required={field.required}
        type={field.type || "text"}
        defaultValue={
          field.type === "checkbox" ? undefined : initialValue(editing, field.key)
        }
        defaultChecked={
          field.type === "checkbox"
            ? field.createOnly
              ? true
              : Boolean(editing?.[field.key])
            : undefined
        }
        placeholder={
          !field.type || field.type === "text"
            ? `Enter ${field.label.toLowerCase()}`
            : undefined
        }
        className={inputClass}
      />
    </label>
  );
}

function initialValue(item: AcademicRecord, key: string) {
  const value = item?.[key];
  if (value && typeof value === "object") {
    const id = (value as { _id?: unknown })._id;
    return id == null ? "" : String(id);
  }
  if ((key.endsWith("Date") || key.endsWith("At")) && value) {
    return String(value).slice(0, key.endsWith("At") ? 16 : 10);
  }
  return value == null ? "" : String(value);
}

function iconFor(resource: string, size = 24): ReactNode {
  const Icon =
    resource === "academic-years"
      ? CalendarDays
      : resource === "classes"
        ? GraduationCap
        : resource === "streams"
          ? Layers3
          : resource === "sections"
            ? UsersRound
            : resource === "subjects" || resource === "stream-subjects"
              ? BookOpen
              : UsersRound;
  return <Icon size={size} />;
}

function iconForField(key: string): ReactNode {
  if (key.includes("Year") || key === "academicYearId") {
    return <CalendarDays size={16} />;
  }
  if (key === "courseId") return <GraduationCap size={16} />;
  if (key === "departmentId" || key === "streamId") {
    return <Layers3 size={16} />;
  }
  if (key === "sectionId" || key === "teacherId") {
    return <UsersRound size={16} />;
  }
  return <BookOpen size={16} />;
}
