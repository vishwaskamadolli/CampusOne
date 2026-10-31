"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
};

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "Search options...",
  icon,
  className = "",
}: {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return options;
    return options.filter((option) =>
      `${option.label} ${option.description || ""}`
        .toLowerCase()
        .includes(search),
    );
  }, [options, query]);

  useEffect(() => {
    if (open && position) searchRef.current?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const expectedHeight = Math.min(
        340,
        118 + Math.min(filteredOptions.length, 4) * 52,
      );
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openAbove =
        spaceBelow < expectedHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.min(
        expectedHeight,
        openAbove ? spaceAbove : spaceBelow,
        window.innerHeight - 16,
      );
      const top = openAbove
        ? rect.top - maxHeight - 6
        : rect.bottom + 6;
      const width = Math.min(
        Math.max(rect.width, 240),
        window.innerWidth - 16,
      );
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - width - 8),
      );
      setPosition({ top, left, width, maxHeight });
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
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
  }, [filteredOptions.length, open]);

  function choose(option: SearchableSelectOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
          setActiveIndex(0);
        }}
        className={`group flex h-12 w-full items-center gap-3 rounded-xl border bg-white px-3 text-left shadow-sm transition duration-200 focus:outline-none focus:ring-4 ${
          open
            ? "border-brand-500 ring-4 ring-brand-100"
            : "border-slate-200 hover:border-slate-300 hover:shadow"
        }`}
      >
        {icon && (
          <span
            aria-hidden="true"
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
              open
                ? "bg-brand-100 text-brand-700"
                : "bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-700"
            }`}
          >
            {icon}
          </span>
        )}
        <span
          className={`min-w-0 flex-1 truncate text-sm font-semibold ${
            selected ? "text-slate-800" : "text-slate-400"
          }`}
        >
          {selected?.label || placeholder || `Select ${label.toLowerCase()}`}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={17}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-brand-600" : ""
          }`}
        />
      </button>

      {open &&
        position &&
        createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
          }}
          className="z-[100] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.16)] ring-1 ring-slate-900/5"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="text-xs font-semibold text-slate-700">
              {label}
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
                  ? `${id}-option-${activeIndex}`
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
            className="min-h-0 flex-1 space-y-1 overflow-y-auto"
          >
            {filteredOptions.length ? (
              filteredOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    id={`${id}-option-${index}`}
                    key={option.value}
                    type="button"
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
                    {icon && (
                      <span
                        aria-hidden="true"
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${
                          isSelected
                            ? "bg-brand-100 text-brand-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700">
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
                  {options.length ? "No matches found" : "No options available"}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {options.length
                    ? "Try another search."
                    : "Options will appear here when available."}
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
