"use client";

import { useEffect } from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { openBugReportModal } from "@/components/dashboard/bug-report-modal";
import type { PublicUser } from "@/types/user";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  user: PublicUser | null;
  sourceUrl?: string;
}

export function MobileNav({
  open,
  onClose,
  user,
  sourceUrl = siteConfig.sourceUrl,
}: MobileNavProps) {
  const loggedIn = !!user;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <div
      className={"mobile-menu" + (open ? " open" : "")}
      id="mobileMenu"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mobile-menu-panel">
        <div className="mobile-menu-header">
          <Link
            href="/"
            className="logo-mark"
            style={{ gap: 8 }}
            aria-label="Nexus home"
            onClick={onClose}
          >
            <div className="logo-sq">N</div>
            <span className="logo-text">Nexus</span>
          </Link>
          <button
            className="mobile-menu-close"
            aria-label="Close menu"
            onClick={onClose}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="mobile-menu-content">
          <a href="/#features" className="nav-link" onClick={onClose}>
            Features
          </a>
          <a href="/#schedule" className="nav-link" onClick={onClose}>
            Schedule
          </a>
          <Link href="/status" className="nav-link" onClick={onClose}>
            Status
          </Link>
          <button
            type="button"
            className="nav-link btn-nav-link text-left"
            onClick={() => {
              onClose();
              openBugReportModal();
            }}
          >
            Report Bug
          </button>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
            onClick={onClose}
          >
            Source ↗
          </a>
        </div>
        <div className="mobile-menu-footer">
          {loggedIn ? (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--muted)",
                  padding: "0 4px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Signed in as @{user.githubLogin}
                {user.isAdmin && <span className="admin-badge">ADMIN</span>}
              </div>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="btn-nav-outline"
                  style={{ textAlign: "center" }}
                  onClick={onClose}
                >
                  Admin Panel
                </Link>
              )}
              <a
                href="/api/auth/logout"
                className="btn-nav-outline"
                style={{ textAlign: "center" }}
              >
                Log out
              </a>
              <a
                href="#configSection"
                className="btn-nav-filled"
                style={{ textAlign: "center" }}
                onClick={onClose}
              >
                → Dashboard
              </a>
            </>
          ) : (
            <a
              href="/api/auth/start"
              className="btn-nav-filled"
              style={{ textAlign: "center" }}
            >
              Continue with GitHub
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
