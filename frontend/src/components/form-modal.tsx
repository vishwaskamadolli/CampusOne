"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function FormModal({
  titleId,
  title,
  description,
  icon,
  onClose,
  maxWidth = "max-w-3xl",
  children,
}: {
  titleId: string;
  title: string;
  description: string;
  icon: ReactNode;
  onClose: () => void;
  maxWidth?: "max-w-2xl" | "max-w-3xl" | "max-w-4xl";
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`flex max-h-[94vh] w-full ${maxWidth} flex-col overflow-hidden rounded-3xl bg-white shadow-2xl`}
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-2xl font-bold tracking-tight text-slate-900"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-200"
            aria-label="Close form"
          >
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function FormSectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="-mx-4 -mt-4 mb-4 flex items-center gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3 text-slate-900 sm:-mx-5 sm:-mt-5 sm:px-5">
      <span className="text-brand-700">{icon}</span>
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}
