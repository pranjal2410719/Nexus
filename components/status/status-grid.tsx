"use client";

import type { HealthReport } from "@/types/health";
import { DEFAULT_DAILY_CAP } from "@/config/constants";

interface StatusGridProps {
  health: HealthReport;
}

export function StatusGrid({ health }: StatusGridProps) {
  const manualCapDisplay = (() => {
    const cap = health.env.MANUAL_DAILY_CAP;
    if (cap !== "missing" && cap !== "configured") {
      return cap;
    }
    if (cap === "configured") {
      return "configured";
    }
    return `default ${DEFAULT_DAILY_CAP}`;
  })();

  return (
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
              (health.env.GITHUB_CLIENT_ID === "configured" ? "ok" : "err")
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
              (health.env.GITHUB_CLIENT_SECRET === "configured" ? "ok" : "err")
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
              (health.env.BLOBS_MASTER_KEY === "configured" ? "ok" : "err")
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
              (health.env.MANUAL_DAILY_CAP !== "missing" &&
              health.env.MANUAL_DAILY_CAP !== "configured"
                ? "ok"
                : "warn")
            }
          >
            {manualCapDisplay}
          </span>
        </span>
      </div>
    </div>
  );
}
