"use client";

interface HeroBannerProps {
  visible: boolean;
}

export function HeroBanner({ visible }: HeroBannerProps) {
  if (!visible) return null;

  return (
    <section className="hero" id="landingView" style={{ display: "flex" }}>
      <div className="tagline-badge">
        ⚡ Open Source · Multi-Tenant Commit Engine
      </div>
      <h1 className="hero-title">
        Keep Your GitHub <span className="highlight-wash">Active</span> Daily
      </h1>
      <p className="hero-subhead">
        Nexus runs in the background, firing structured commits across timed
        bursts in <em>your own</em> repository — fully isolated, encrypted,
        and yours.
      </p>
      <a href="/api/auth/start" className="primary-cta">
        <span>→</span>
        <span>Continue with GitHub</span>
      </a>
      <div className="reassurance-caption">
        free forever · your token is encrypted at rest · only ever touches
        your repos
      </div>
    </section>
  );
}
