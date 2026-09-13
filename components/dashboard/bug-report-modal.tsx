"use client";

import { useEffect, useRef, useState } from "react";

export const BUG_REPORT_EVENT = "nexus:open-bug-report";

export function openBugReportModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BUG_REPORT_EVENT));
  }
}

const BUG_TYPES = [
  { value: "bug", label: "Bug" },
  { value: "ui", label: "UI / Mobile Navigation" },
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

export interface BugReportModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  recipientEmail?: string;
}

export function BugReportModal({
  isOpen,
  onClose,
  recipientEmail = "2k24.cs1l.2410719@gmail.com",
}: BugReportModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof isOpen === "boolean";
  const open = isControlled ? isOpen : internalOpen;

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

  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  // Global custom event listener
  useEffect(() => {
    function handleOpenEvent() {
      if (!isControlled) {
        lastActiveElementRef.current = document.activeElement as HTMLElement | null;
        setInternalOpen(true);
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener(BUG_REPORT_EVENT, handleOpenEvent);
      return () => window.removeEventListener(BUG_REPORT_EVENT, handleOpenEvent);
    }
  }, [isControlled]);

  const handleClose = () => {
    if (isControlled && onClose) {
      onClose();
    } else {
      setInternalOpen(false);
    }
    setStatus({ kind: "", text: "" });
    if (lastActiveElementRef.current) {
      lastActiveElementRef.current.focus();
    }
  };

  // Body scroll lock & focus management
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const timer = setTimeout(() => {
        if (closeBtnRef.current) {
          closeBtnRef.current.focus();
        } else if (modalRef.current) {
          const firstInput = modalRef.current.querySelector<HTMLElement>("input, select, textarea");
          firstInput?.focus();
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

  // Keyboard navigation: Escape to close and Tab trapping
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
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

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      setStatus({ kind: "err", text: "Please provide a short summary or title." });
      return;
    }
    if (!description.trim()) {
      setStatus({ kind: "err", text: "Please describe what happened or needs improvement." });
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
        text: "✓ Opening your email client with the pre-filled report.",
      });
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setEmail("");
        setType("bug");
        setSeverity("medium");
        setStatus({ kind: "", text: "" });
        handleClose();
      }, 2000);
    } catch {
      setStatus({
        kind: "err",
        text: "Could not open email client automatically. Please email 2k24.cs1l.2410719@gmail.com directly.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="bug-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bug-modal-card" ref={modalRef}>
        <div className="bug-modal-header">
          <div>
            <div className="bug-modal-badge">COMMUNITY FEEDBACK</div>
            <h2 id="bug-modal-heading" className="bug-modal-title">
              Report an Issue
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="bug-modal-close"
            onClick={handleClose}
            aria-label="Close bug report modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bug-modal-form">
          <div className="bug-modal-body">
            <p className="bug-modal-intro">
              Found a bug, styling defect, or navigation problem? Send a report directly to the maintainer.
            </p>

            <div className="bug-form-row">
              <div className="bug-form-group">
                <label htmlFor="bug-modal-type">Category</label>
                <select
                  id="bug-modal-type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {BUG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bug-form-group">
                <label htmlFor="bug-modal-severity">Severity</label>
                <select
                  id="bug-modal-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
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
              <label htmlFor="bug-modal-title">Summary *</label>
              <input
                id="bug-modal-title"
                type="text"
                placeholder="Short summary (e.g. mobile navigation menu clipping)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="bug-form-group">
              <label htmlFor="bug-modal-description">Description *</label>
              <textarea
                id="bug-modal-description"
                placeholder="What happened? What screen size or browser did you observe it on?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="bug-form-group">
              <label htmlFor="bug-modal-email">Your Email (Optional)</label>
              <input
                id="bug-modal-email"
                type="email"
                placeholder="you@domain.com (if you want updates)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {status.text && (
              <div
                className={`bug-submit-status ${status.kind}`}
                role="status"
                aria-live="polite"
              >
                {status.text}
              </div>
            )}
          </div>

          <div className="bug-modal-footer">
            <span className="bug-modal-note">
              Opens email client addressed to <code>{recipientEmail}</code>
            </span>
            <div className="bug-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={handleClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-modal-submit"
                disabled={busy}
              >
                {busy ? "Preparing…" : "Send Bug Report ↗"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
