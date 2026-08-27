"use client";

import type { HealthReport } from "@/types/health";
import { StatusGrid } from "./status-grid";

interface HealthCardProps {
  health: HealthReport | null;
  healthLoading: boolean;
  healthError: string;
  healthCheckedAt: string | null;
  onRefresh: () => void;
}

export function HealthCard({
  health,
  healthLoading,
  healthError,
  healthCheckedAt,
  onRefresh,
}: HealthCardProps) {
  return (
    <div
      className="health-card"
      id="healthCard"
      style={{ maxWidth: "720px", margin: "0 auto" }}
    >
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
          onClick={onRefresh}
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
            : health?.ok
              ? "Operational — all systems configured"
              : "Attention needed — setup incomplete"}
      </div>
      {health && (
        <>
          <StatusGrid health={health} />
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
  );
}
