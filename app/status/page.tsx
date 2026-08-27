"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HealthCard } from "@/components/status/health-card";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { siteConfig } from "@/config/site";
import type { HealthReport } from "@/types/health";
import type { PublicUser } from "@/types/user";

export default function StatusPage() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState("");
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
      setHealthError(res.ok ? "" : `Health check returned ${res.status}`);
      setHealthCheckedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setHealthError(err.message || "Failed to reach health endpoint");
      setHealth(null);
      setHealthCheckedAt(new Date().toLocaleTimeString());
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="wrap">
      <nav className="navbar">
        <Link href="/" className="logo-mark" aria-label="Nexus home">
          <div className="logo-sq">N</div>
          <span className="logo-text">Nexus</span>
        </Link>

        <div className="nav-links">
          <Link href="/#features" className="nav-link">
            Features
          </Link>
          <Link href="/#schedule" className="nav-link">
            Schedule
          </Link>
          <Link href="/status" className="nav-link">
            Status
          </Link>
          <a
            href={siteConfig.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            Source ↗
          </a>
        </div>

        <div className="nav-actions">
          <Link href="/" className="btn-nav-outline">
            ← Back to Dashboard
          </Link>
        </div>

        <button
          className={"menu-toggle" + (menuOpen ? " open" : "")}
          id="menuToggle"
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        sourceUrl={siteConfig.sourceUrl}
      />

      <main>
        <section className="hero" style={{ minHeight: "auto", padding: "48px 0" }}>
          <HealthCard
            health={health}
            healthLoading={healthLoading}
            healthError={healthError}
            healthCheckedAt={healthCheckedAt}
            onRefresh={loadHealth}
          />
        </section>
      </main>

      <footer>
        <span>Nexus — Open Source Commit Engine</span>
        <span>
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/-pranjal22/"
            target="_blank"
            rel="noreferrer"
          >
            Pranjal Yadav
          </a>
        </span>
        <a href={siteConfig.sourceUrl} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </div>
  );
}