"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);

  const paginatedItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, pageSize, setPageSize, pageCount, paginatedItems };
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (!total) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>Showing {first}–{last} of {total}</p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <label className="flex items-center gap-2">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"
          >
            {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={17}/></button>
          <span className="min-w-20 text-center font-medium">{page} / {pageCount}</span>
          <button aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={17}/></button>
        </div>
      </div>
    </div>
  );
}
