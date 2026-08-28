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

export function BugReportPanel() {
  const [open, setOpen] = useState(false);
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

  // Toggle body scroll lock when panel opens
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    setOpen((prev) => !prev);
    setStatus({ kind: "", text: "" });
  }

  function close() {
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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
    const mailto = `mailto:2k24.cs1l.2410719@gmail.com?subject=${encodeURIComponent(
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
    } catch (err) {
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="bugReportTitle"
      >
        <div
          className="slideOutTab"
          onClick={toggle}
          role="button"
          tabIndex={0}
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
        <div className="slideOut-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h4 className="modal-title" id="bugReportTitle">
              <span aria-hidden="true">🐞</span> Report a Bug
            </h4>
            <button
              type="button"
              className="modal-close"
              onClick={close}
              aria-label="Close bug report panel"
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-intro">
              Spotted something broken or confusing? Tell us what happened and
              we&apos;ll dig in. The details will open in your email client.
            </p>
            <form onSubmit={handleSubmit}>
              <div className="bug-form-row">
                <div className="bug-form-group">
                  <label htmlFor="bug-type">Type</label>
                  <select
                    id="bug-type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
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
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary of the issue"
                  maxLength={120}
                />
              </div>
              <div className="bug-form-group">
                <label htmlFor="bug-description">What happened?</label>
                <textarea
                  id="bug-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Steps to reproduce, expected vs actual, anything else useful..."
                  rows={5}
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
                />
              </div>
              {status.text && (
                <div className={`bug-submit-status ${status.kind}`}>
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
              type="button"
              className="bug-submit-btn"
              onClick={handleSubmit}
              disabled={busy}
            >
              <span aria-hidden="true">📨</span> Send Report
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
