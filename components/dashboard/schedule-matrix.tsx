"use client";

import type { ScheduleSlot } from "@/types/user";

interface ScheduleMatrixProps {
  slots: ScheduleSlot[];
  timezone: string;
}

export function ScheduleMatrix({ slots, timezone }: ScheduleMatrixProps) {
  return (
    <>
      <div className="section-label" id="schedule">
        Your Burst Schedule
      </div>
      <div className="matrix-grid" id="matrixGrid">
        {slots && slots.length > 0 ? (
          slots.map((slot, i) => (
            <div className="matrix-card" key={i}>
              <div className="matrix-time">{slot.time}</div>
              <div className="matrix-meta">
                Burst {i + 1} · {slot.count} commits · {timezone}
              </div>
            </div>
          ))
        ) : (
          <div className="matrix-empty">
            No slots configured yet — add bursts in Step 1.
          </div>
        )}
      </div>
    </>
  );
}
