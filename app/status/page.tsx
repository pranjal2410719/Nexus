"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader } from "../components/loader";

interface HealthEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  BLOBS_MASTER_KEY: string;
  MANUAL_DAILY_CAP: string;
}
interface HealthReport {
  ok: boolean;
  service: string;
  node: string;
  environment: string;
  onNetlify: boolean;
  store: { mode: string; roundtrip: string; detail?: string };
  env: HealthEnv;
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthError, setHealthError] = useState("");
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);

  async function refreshHealth() {
    setHealthLoading(true);
    setHealthError("");
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data as HealthReport);
      setHealthCheckedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setHealthError(err.message || "Health check failed");
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    refreshHealth();
  }, []);

  return (
    <div className="wrap">
      {healthLoading && <Loader label="Checking service status…" />}

      <nav className="navbar">
        <a href="/" className="logo-mark" aria-label="Nexus home">
          <div className="logo-sq">N</div>
          <span className="logo-text">Nexus</span>
        </a>

        <div className="nav-center">
          <Link href="#features" className="nav-link">
            Features
          </Link>
          <Link href="#schedule" className="nav-link">
            Schedule
          </Link>
          <a
            href="https://github.com/pranjal2410719/"
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
          className="menu-toggle"
          id="menuToggle"
          aria-label="Toggle navigation menu"
          aria-expanded={false}
          onClick={() => {}}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      <main>
        <section className="hero" style={{ minHeight: "auto", padding: "48px 0" }}>
          <div className="health-card" id="healthCard" style={{ maxWidth: "720px", margin: "0 auto" }}>
            <div className="health-top">
              <span className="health-title">
                <span
                  className={
                    "health-dot " +
                    (healthLoading
                      ? "loading"
                      : healthError
                        ? "warn"
                        : health?.ok
                          ? "ok"
                          : "warn")
                  }
                />
                Service Status
              </span>
              <button
                className="health-refresh"
                onClick={refreshHealth}
                disabled={healthLoading}
                aria-label="Refresh status"
              >
                ↻ Refresh
              </button>
            </div>
            <div className="health-status">
              {healthLoading
                ? "Checking…"
                : healthError
                  ? "Status unavailable"
                  : health!.ok
                    ? "Operational — all systems configured"
                    : "Attention needed — setup incomplete"}
            </div>
            {health && (
              <>
                <div className="health-grid">
                  <div className="health-item">
                    <span className="label">Store</span>
                    <span className="value">
                      {health.store.mode === "netlify-blobs"
                        ? "Netlify Blobs"
                        : health.store.mode === "local-file"
                          ? "Local file store"
                          : "Not configured"}
                      <span
                        className={
                          "health-chip " +
                          (health.store.roundtrip === "ok"
                            ? "ok"
                            : health.store.roundtrip === "error"
                              ? "err"
                              : "warn")
                        }
                      >
                        {health.store.roundtrip === "ok"
                          ? "read/write ok"
                          : health.store.roundtrip === "error"
                            ? "failed"
                            : "n/a"}
                      </span>
                    </span>
                  </div>
                  <div className="health-item">
                    <span className="label">Runtime</span>
                    <span className="value">
                      node {health.node} · {health.environment}
                      {health.onNetlify ? " · netlify" : ""}
                    </span>
                  </div>
                  <div className="health-item">
                    <span className="label">OAuth ID</span>
                    <span className="value">
                      <span
                        className={
                          "health-chip " +
                          (health.env.GITHUB_CLIENT_ID === "configured"
                            ? "ok"
                            : "err")
                        }
                      >
                        {health.env.GITHUB_CLIENT_ID === "configured"
                          ? "✓ configured"
                          : "✗ missing"}
                      </span>
                    </span>
                  </div>
                  <div className="health-item">
                    <span className="label">OAuth Secret</span>
                    <span className="value">
                      <span
                        className={
                          "health-chip " +
                          (health.env.GITHUB_CLIENT_SECRET === "configured"
                            ? "ok"
                            : "err")
                        }
                      >
                        {health.env.GITHUB_CLIENT_SECRET === "configured"
                          ? "✓ configured"
                          : "✗ missing"}
                      </span>
                    </span>
                  </div>
                  <div className="health-item">
                    <span className="label">Encryption Key</span>
                    <span className="value">
                      <span
                        className={
                          "health-chip " +
                          (health.env.BLOBS_MASTER_KEY === "configured"
                            ? "ok"
                            : "err")
                        }
                      >
                        {health.env.BLOBS_MASTER_KEY === "configured"
                          ? "✓ configured"
                          : "✗ missing"}
                      </span>
                    </span>
                  </div>
                  <div className="health-item">
                    <span className="label">Manual Cap</span>
                    <span className="value">
                      <span
                        className={
                          "health-chip " +
                          (health.env.MANUAL_DAILY_CAP !== "missing" && health.env.MANUAL_DAILY_CAP !== "configured"
                            ? "ok"
                            : health.env.MANUAL_DAILY_CAP === "configured"
                              ? "warn"
                              : "warn")
                        }
                      >
                        {health.env.MANUAL_DAILY_CAP !== "missing" && health.env.MANUAL_DAILY_CAP !== "configured"
                          ? health.env.MANUAL_DAILY_CAP
                          : health.env.MANUAL_DAILY_CAP === "configured"
                            ? "configured"
                            : "default 50"}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="health-meta">
                  <span>
                    {health.service} · checked {healthCheckedAt ?? "…"}
                  </span>
                  <span>env values shown as presence flags only</span>
                </div>
              </>
            )}
            {healthError && <div className="health-err">✗ {healthError}</div>}
          </div>
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
        <a href="https://github.com/pranjal2410719/" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </div>
  );
}