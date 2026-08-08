"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuOption {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface MenuSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: MenuOption[];
  placeholder?: string;
  menuLabel?: string;
  id?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  align?: "start" | "end";
  className?: string;
}

export function MenuSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  menuLabel,
  id,
  disabled = false,
  loading = false,
  error,
  align = "start",
  className = "",
}: MenuSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const currentIdx = options.findIndex((o) => o.value === value);
  const busy = disabled || loading;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        wrapRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIdx]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (busy) return;
    setActiveIdx(currentIdx >= 0 ? currentIdx : 0);
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (busy) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setActiveIdx(currentIdx >= 0 ? currentIdx : 0);
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIdx(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIdx(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[activeIdx]) {
          onChange(options[activeIdx].value);
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  function select(o: MenuOption) {
    onChange(o.value);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={"menu-select" + (className ? ` ${className}` : "")}>
      <button
        id={id}
        type="button"
        className={
          "menu-select-trigger" +
          (open ? " open" : "") +
          (error ? " err" : "")
        }
        disabled={busy}
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={loading}
      >
        <span className="menu-select-value">
          {loading ? (
            <span className="menu-select-placeholder">Loading…</span>
          ) : selected ? (
            <>
              {selected.icon && (
                <span className="menu-select-item-icon">{selected.icon}</span>
              )}
              <span className="menu-select-text">{selected.label}</span>
            </>
          ) : (
            <span className="menu-select-placeholder">{placeholder}</span>
          )}
        </span>
        <svg
          className="menu-select-chevron"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {error && <span className="menu-select-error">{error}</span>}

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          className={"menu-select-menu" + (align === "end" ? " align-end" : "")}
        >
          {menuLabel && <div className="menu-select-label">{menuLabel}</div>}
          {options.length === 0 ? (
            <div className="menu-select-empty">No options</div>
          ) : (
            options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                data-active={i === activeIdx}
                className={
                  "menu-select-item" + (o.value === value ? " selected" : "")
                }
                onClick={() => select(o)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                {o.icon && <span className="menu-select-item-icon">{o.icon}</span>}
                <span className="menu-select-item-label">{o.label}</span>
                {o.hint && <span className="menu-select-item-hint">{o.hint}</span>}
                {o.value === value && (
                  <svg
                    className="menu-select-check"
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
