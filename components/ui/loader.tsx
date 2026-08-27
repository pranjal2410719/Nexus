"use client";

import { useEffect } from "react";

export function Loader({ label = "Loading…" }: { label?: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="loader-screen" role="status" aria-live="polite">
      <div className="loader-cube" aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>
      <span className="loader-label">{label}</span>
    </div>
  );
}
