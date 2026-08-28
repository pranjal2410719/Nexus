"use client";

import { useEffect, useRef, useState } from "react";

const BUG_TYPES = [
  { value: "bug", label: "Bug" },
  { value: "ui", label: "UI/UX" },
  { value: "performance", label: "Performance" },
  { value: "feature", label: "Feature Request" },
  { value: "other", label: "Other" },
];

const SEVERITY_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

interface BugReport {
  type: string;
  severity: string;
  title: string;
  description: string;
  email: string;
  page: string;
  timestamp: string;
}

function buildMailtoBody(report: BugReport): string {
  const lines = [
    `Type: ${report.type}`,
    `Severity: ${report.severity}`,
    `Page: ${report.page}`,
    `Reported: ${report.timestamp}`,
    "",
    "Title:",
    report.title,
    "",
    "Description:",
    report.description,
    "",
    "Reply contact:",
    report.email || "(none provided)",
  ];
  return lines.join("\n");
}

export interface BugReportPanelProps {
  initialOpen?: boolean;
  recipientEmail?: string;
  storageKey?: string;
  onOpenChange?: (open: boolean) => void;
}

export function BugReportPanel({
  initialOpen = false,
  recipientEmail = "2k24.cs1l.2410719@gmail.com",
  storageKey = "nexus_bug_panel_open",
  onOpenChange,
}: BugReportPanelProps = {}) {
  const [open, setOpen] = useState(initialOpen);
  const [type, setType] = useState("bug");
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "" | "ok" | "err"; text: string }>({
    kind: "",
    text: "",
  });
  const [busy, setBusy] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const isMountedRef = useRef(false);
  const prevOpenRef = useRef(open);

  // SSR-safe localStorage synchronization
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(storageKey);
        if (stored !== null) {
          const isStoredOpen = stored === "true";
          setOpen(isStoredOpen);
          onOpenChange?.(isStoredOpen);
        }
      }
    } catch {
      // Storage access may fail in restricted/sandboxed environments
    }
    isMountedRef.current = true;
  }, [storageKey, onOpenChange]);

  const updateOpenState = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (isMountedRef.current) {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(storageKey, String(nextOpen));
        }
      } catch {
        // Storage access may fail in restricted/sandboxed environments
      }
    }
    onOpenChange?.(nextOpen);
  };

  // Toggle body scroll lock and manage initial focus
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const timer = setTimeout(() => {
        if (closeBtnRef.current) {
          closeBtnRef.current.focus();
        } else if (modalRef.current) {
          const firstFocusable = modalRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Focus restoration on close
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    prevOpenRef.current = open;
  }, [open]);

  // Close on Escape & Cyclical Focus Trapping
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;

      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === "Tab") {
        const modal = modalRef.current;
        if (!modal) return;

        const focusable = Array.from(
          modal.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || active === first || !modal.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!active || active === last || !modal.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    updateOpenState(!open);
    setStatus({ kind: "", text: "" });
  }

  function close() {
    updateOpenState(false);
  }

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (!title.trim()) {
      setStatus({ kind: "err", text: "Please add a short title for the report." });
      return;
    }
    if (!description.trim()) {
      setStatus({ kind: "err", text: "Please describe what happened." });
      return;
    }

    setBusy(true);
    setStatus({ kind: "", text: "" });

    const report: BugReport = {
      type,
      severity,
      title: title.trim(),
      description: description.trim(),
      email: email.trim(),
      page: typeof window !== "undefined" ? window.location.pathname : "",
      timestamp: new Date().toISOString(),
    };

    const subject = `[Nexus ${report.severity.toUpperCase()}] ${report.title}`;
    const body = buildMailtoBody(report);
    const mailto = `mailto:${recipientEmail}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    try {
      if (typeof window !== "undefined") {
        window.location.href = mailto;
      }
      setStatus({
        kind: "ok",
        text: "Opening your email client with the report ready to send.",
      });
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setEmail("");
        setType("bug");
        setSeverity("medium");
        setStatus({ kind: "", text: "" });
      }, 2400);
    } catch {
      setStatus({
        kind: "err",
        text: "Could not open the email client. Please copy the details and email us directly.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`bug-backdrop ${open ? "show" : ""}`}
        onClick={close}
        aria-hidden="true"
      />
      <div
        id="slideOut"
        ref={panelRef}
        className={open ? "showSlideOut" : ""}
      >
        <div
          ref={triggerRef}
          className="slideOutTab"
          onClick={toggle}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          aria-controls="slideOut-modal"
          aria-label={open ? "Close bug report panel" : "Open bug report panel"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
        >
          <div className="slideOutTab-inner"><span className="bug-label">Report Bug</span></div>
        </div>
        <div
          id="slideOut-modal"
          ref={modalRef}
          className="slideOut-modal" onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bugReportTitle"
          aria-hidden={!open}
          tabIndex={open ? undefined : -1}
        >
          <div className="modal-header">
            <h4 className="modal-title" id="bugReportTitle">
              <span aria-hidden="true">🐞</span> Report a Bug
            </h4>
            <button
              ref={closeBtnRef}
              type="button"
              className="modal-close"
              onClick={close}
              aria-label="Close bug report panel"
              tabIndex={open ? 0 : -1}
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-intro">
              Spotted something broken or confusing? Tell us what happened and
              we&apos;ll dig in. The details will open in your email client.
            </p>
            <form id="bug-report-form" onSubmit={handleSubmit}>
              <div className="bug-form-row">
                <div className="bug-form-group">
                  <label htmlFor="bug-type">Type</label>
                  <select
                    id="bug-type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    tabIndex={open ? 0 : -1}
                  >
                    {BUG_TYPES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bug-form-group">
                  <label htmlFor="bug-severity">Severity</label>
                  <select
                    id="bug-severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    tabIndex={open ? 0 : -1}
                  >
                    {SEVERITY_LEVELS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bug-form-group">
                <label htmlFor="bug-title">Title</label>
                <input
                  id="bug-title"
                  type="text"
                  required
                  aria-required="true"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary of the issue"
                  maxLength={120}
                  tabIndex={open ? 0 : -1}
                />
              </div>
              <div className="bug-form-group">
                <label htmlFor="bug-description">What happened?</label>
                <textarea
                  id="bug-description"
                  required
                  aria-required="true"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Steps to reproduce, expected vs actual, anything else useful..."
                  rows={5}
                  tabIndex={open ? 0 : -1}
                />
              </div>
              <div className="bug-form-group">
                <label htmlFor="bug-email">Reply email (optional)</label>
                <input
                  id="bug-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  tabIndex={open ? 0 : -1}
                />
              </div>
              {status.text && (
                <div
                  className={`bug-submit-status ${status.kind}`}
                  role={status.kind === "err" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {status.text}
                </div>
              )}
            </form>
          </div>
          <div className="modal-footer">
            <span className="bug-form-note">
              Submissions open your default mail app.
            </span>
            <button
              type="submit"
              form="bug-report-form"
              className="bug-submit-btn"
              onClick={handleSubmit}
              disabled={busy}
              tabIndex={open ? 0 : -1}
            >
              <span aria-hidden="true">📨</span> Send Report
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
