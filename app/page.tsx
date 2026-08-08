"use client";

import { useEffect, useState } from "react";
import { MenuSelect, type MenuOption } from "./components/menu-select";

// ---------- Inline icons ----------

function RepoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 4v2h-.25A1.75 1.75 0 0 0 2 7.75v5.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 13.25v-5.5A1.75 1.75 0 0 0 12.25 6H12V4a4 4 0 1 0-8 0Zm6.5 2V4a2.5 2.5 0 0 0-5 0v2Z" />
    </svg>
  );
}

// ---------- Types (public shapes from lib/auth.ts) ----------

interface ScheduleSlot {
  time: string;
  count: number;
  lastRun: string | null;
}

interface UserConfig {
  githubId: string;
  githubLogin: string;
  owner: string;
  repo: string;
  targetFile: string;
  timezone: string;
  slots: ScheduleSlot[];
  createdAt: string;
  updatedAt: string;
}

interface Repo {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
}

const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const SOURCE_URL = "https://github.com/pranjal2410719/";

export default function Home() {
  // ---------- State ----------
  const [user, setUser] = useState<UserConfig | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposError, setReposError] = useState("");
  const [repoVal, setRepoVal] = useState("");
  const [targetFile, setTargetFile] = useState("PROGRESS_LOG.md");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [flashMsg, setFlashMsg] = useState("");
  const [slotLimitMsg, setSlotLimitMsg] = useState("");
  const [manualLimitMsg, setManualLimitMsg] = useState("");
  const [saveStatus, setSaveStatus] = useState<{
    text: string;
    kind: "" | "ok" | "err";
  }>({ text: "", kind: "" });
  const [dispatch, setDispatch] = useState({
    busy: false,
    btnText: "Dispatch Instant Commit",
    status: "STATUS: —",
    sha: "#------",
    quote: "",
    commitUrl: "",
    show: false,
  });
  const [todayCount, setTodayCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const todayKey = `nexus_manual_${new Date().toDateString()}`;

  // ---------- Mobile menu ----------
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

  // ---------- Boot ----------
  useEffect(() => {
    (async () => {
      // Surface ?error= from the OAuth callback
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      if (err) {
        const detail = params.get("detail");
        setFlashMsg(`Sign-in issue: ${err}${detail ? ` (${detail})` : ""}`);
        window.history.replaceState(null, "", "/");
      }

      setTodayCount(parseInt(localStorage.getItem(todayKey) || "0", 10));

      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          const u = data.user as UserConfig;
          setUser(u);
          setTargetFile(u.targetFile || "PROGRESS_LOG.md");
          setTimezone(u.timezone || "Asia/Kolkata");
          setSlots(u.slots ?? []);
          loadRepos(u);
        }
      } catch {
        // stay logged out
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset manual limit message at midnight
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      setManualLimitMsg("");
    }, msUntilMidnight);
    return () => clearTimeout(timer);
  }, []);

  // ---------- Repo picker ----------
  async function loadRepos(u: UserConfig) {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load repos");
      const list = (data.repos || []) as Repo[];
      setRepos(list);
      setReposError("");
      // Preselect current config, else fall back to first repo
      const cur = u.owner && u.repo ? `${u.owner}/${u.repo}` : "";
      if (cur && list.some((r) => `${r.owner}/${r.name}` === cur)) {
        setRepoVal(cur);
      } else if (cur) {
        setRepoVal(cur); // shown as "(current)" option in the picker
      } else if (list.length > 0) {
        setRepoVal(`${list[0].owner}/${list[0].name}`);
      }
    } catch (err: any) {
      setRepos([]);
      setReposError(err.message || "Failed to load repos");
    }
}

// ---------- Slots editor ----------
  function addSlot() {
    if (slots.length >= 3) {
      setSlotLimitMsg("Maximum 3 slots allowed. Upcoming feature will allow more.");
      setTimeout(() => setSlotLimitMsg(""), 5000);
      return;
    }
    setSlots([...slots, { time: "12:00", count: 1, lastRun: null }]);
  }

  function removeSlot(i: number) {
    setSlots(slots.filter((_, idx) => idx !== i));
  }

  function setSlotTime(i: number, time: string) {
    setSlots(slots.map((s, idx) => (idx === i ? { ...s, time } : s)));
  }

  function setSlotCount(i: number, count: number) {
    setSlots(slots.map((s, idx) => (idx === i ? { ...s, count } : s)));
  }

  // ---------- Save config ----------
  async function saveConfig() {
    const [owner, repo] = repoVal.split("/");
    const payload = {
      owner,
      repo,
      targetFile: targetFile.trim(),
      timezone,
      slots: slots.map((s) => ({ time: s.time, count: s.count })),
    };
    setSaveStatus({ text: "Saving…", kind: "" });
    try {
      const res = await fetch("/api/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const u = data.user as UserConfig;
      setUser(u);
      setSlots(u.slots ?? []);
      setTargetFile(u.targetFile || "PROGRESS_LOG.md");
      setTimezone(u.timezone || "Asia/Kolkata");
      setRepoVal(u.owner && u.repo ? `${u.owner}/${u.repo}` : repoVal);
      setSaveStatus({ text: "✓ Saved", kind: "ok" });
      setTimeout(() => setSaveStatus({ text: "", kind: "" }), 2500);
    } catch (err: any) {
      setSaveStatus({
        text: "✗ " + (err.message || "Save failed"),
        kind: "err",
      });
    }
  }

  // ---------- Manual dispatch ----------
  async function triggerCommit() {
    setDispatch((d) => ({
      ...d,
      busy: true,
      btnText: "Dispatching Commit…",
      show: false,
    }));
    try {
      const res = await fetch("/api/commit-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        const newToday = todayCount + 1;
        const newSession = sessionCount + 1;
        setTodayCount(newToday);
        setSessionCount(newSession);
        localStorage.setItem(todayKey, String(newToday));
        setDispatch({
          busy: false,
          btnText: "Commit Dispatched!",
          status: "STATUS: SUCCESS",
          sha: data.sha ? `#${data.sha}` : "",
          quote: data.quote,
          commitUrl: data.commitUrl || "",
          show: true,
        });
        setTimeout(() => {
          setDispatch((d) => ({
            ...d,
            busy: false,
            btnText: "Dispatch Instant Commit",
          }));
        }, 2500);
      } else if (res.status === 429) {
        // Daily limit exceeded
        setManualLimitMsg(data.error || "Daily manual commit limit reached. Resets at midnight.");
        setDispatch((d) => ({
          ...d,
          busy: false,
          btnText: "Dispatch Instant Commit",
        }));
      } else {
        throw new Error(data.error || "Dispatch failed");
      }
    } catch (err: any) {
      setDispatch({
        busy: false,
        btnText: "Retry Dispatch",
        status: "STATUS: ERROR",
        sha: "#FAIL",
        quote: err.message || "Dispatch failed",
        commitUrl: "",
        show: true,
      });
    }
  }

  // ---------- Derived render data ----------
  const loggedIn = !!user;

  const repoOptions = (() => {
    const opts: MenuOption[] = repos.map((r) => ({
      value: `${r.owner}/${r.name}`,
      label: r.full_name,
      hint: r.private ? "private" : undefined,
      icon: r.private ? <LockIcon /> : <RepoIcon />,
    }));
    if (user && user.owner && user.repo) {
      const cur = `${user.owner}/${user.repo}`;
      if (!opts.some((o) => o.value === cur)) {
        opts.push({ value: cur, label: cur, hint: "current", icon: <RepoIcon /> });
      }
    }
    return opts;
  })();

  const timezoneOptions = (() => {
    const list =
      timezone && !TIMEZONES.includes(timezone)
        ? [...TIMEZONES, timezone]
        : TIMEZONES;
    return list.map((tz) => ({ value: tz, label: tz }));
  })();

  const dashSub = user
    ? user.repo
      ? `→ ${user.owner}/${user.repo} · ${user.targetFile} · ${user.timezone}`
      : "→ Connect a repository below to get started."
    : "—";

  const matrixCards =
    user && user.slots && user.slots.length > 0 ? user.slots : null;

  return (
    <div className="wrap">
      {/* ===== Navbar ===== */}
      <nav className="navbar">
        <a href="/" className="logo-mark" aria-label="Nexus home">
          <div className="logo-sq">N</div>
          <span className="logo-text">Nexus</span>
        </a>

        <div className="nav-center">
          <a href="#features" className="nav-link">
            Features
          </a>
          <a href="#schedule" className="nav-link">
            Schedule
          </a>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            Source ↗
          </a>
        </div>

        <div className="nav-actions">
          {loggedIn ? (
            <>
              <span className="nav-user">@{user!.githubLogin}</span>
              <a href="/api/auth/logout" className="btn-nav-outline">
                Log out
              </a>
              <a href="#configSection" className="btn-nav-filled">
                → Dashboard
              </a>
            </>
          ) : (
            <a href="/api/auth/start" className="btn-nav-filled">
              Continue with GitHub
            </a>
          )}
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

      {/* ===== Mobile menu ===== */}
      <div
        className={"mobile-menu" + (menuOpen ? " open" : "")}
        id="mobileMenu"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) setMenuOpen(false);
        }}
      >
        <div className="mobile-menu-panel">
          <div className="mobile-menu-header">
            <a
              href="/"
              className="logo-mark"
              style={{ gap: 8 }}
              aria-label="Nexus home"
            >
              <div className="logo-sq">N</div>
              <span className="logo-text">Nexus</span>
            </a>
            <button
              className="mobile-menu-close"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
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
            <a
              href="#features"
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#schedule"
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              Schedule
            </a>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="nav-link"
              onClick={() => setMenuOpen(false)}
            >
              Source ↗
            </a>
            <div className="mobile-menu-actions">
              {loggedIn ? (
                <>
                  <a href="/api/auth/logout" className="btn-nav-outline">
                    Log out
                  </a>
                  <a
                    href="#configSection"
                    className="btn-nav-filled"
                    onClick={() => setMenuOpen(false)}
                  >
                    → Dashboard
                  </a>
                </>
              ) : (
                <a
                  href="/api/auth/start"
                  className="btn-nav-filled"
                  onClick={() => setMenuOpen(false)}
                >
                  Continue with GitHub
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <main>
        <div className={"flash" + (flashMsg ? " err" : "")}>{flashMsg}</div>

        {/* ===== Logged-out Hero ===== */}
        <section
          className="hero"
          id="landingView"
          style={{ display: !loggedIn && !loading ? "flex" : "none" }}
        >
          <div className="tagline-badge">
            ⚡ Open Source · Multi-Tenant Commit Engine
          </div>
          <h1 className="hero-title">
            Keep Your GitHub <span className="highlight-wash">Active</span>{" "}
            Daily
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
<div className="backed-strip">
            <span className="backed-label">Powered by:</span>
            <span className="backed-logo">Next.js</span>
            <span className="backed-logo">GitHub REST API</span>
            <span className="backed-logo">Octokit</span>
            <span className="backed-logo">Netlify Blobs</span>
          </div>
        </section>

        {/* ===== Logged-in Dashboard ===== */}
        <section id="dashView" style={{ display: loggedIn ? "block" : "none" }}>
          <div className="dash-head">
            <div>
              <div className="dash-title">Your Commit Studio</div>
              <div className="dash-sub">{dashSub}</div>
            </div>
          </div>

          <div className="section-label" id="configSection">
            Step 1 · Connect your repository
          </div>
          <div className="panel" id="configPanel">
            <h2>Target Repository</h2>
            <p className="panel-note">
              Nexus commits to a file inside <em>your</em> repository.
              Everything is isolated per user — no shared identities, no shared
              files.
            </p>

            <div className="field">
              <label htmlFor="repoSelect">Repository</label>
              <MenuSelect
                id="repoSelect"
                value={repoVal}
                onChange={setRepoVal}
                options={repoOptions}
                placeholder="Choose a repository…"
                menuLabel="Repository"
                loading={!reposError && repoOptions.length === 0}
                error={reposError || undefined}
              />
            </div>

            <div className="field">
              <label htmlFor="targetFile">Target File (in that repo)</label>
              <input
                type="text"
                id="targetFile"
                value={targetFile}
                placeholder="PROGRESS_LOG.md"
                onChange={(e) => setTargetFile(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="timezoneSelect">
                Timezone (your burst clock)
              </label>
              <MenuSelect
                id="timezoneSelect"
                value={timezone}
                onChange={setTimezone}
                options={timezoneOptions}
                placeholder="Select timezone…"
                menuLabel="Timezone"
              />
            </div>

            <div className="section-label" style={{ marginBottom: 16 }}>
              Schedule Slots (your daily bursts)
            </div>
            <div id="slotList">
              {slots.length === 0 && (
                <div className="matrix-empty" style={{ marginBottom: 12 }}>
                  No slots yet — add your first burst below.
                </div>
              )}
              {slots.map((slot, i) => (
                <div className="slot-row" key={i}>
                  <input
                    type="time"
                    className="slot-time"
                    value={slot.time}
                    aria-label="Slot time"
                    onChange={(e) => setSlotTime(i, e.target.value)}
                  />
                  <fieldset className="slot-count-radio" aria-label="Commit count">
                    <input
                      type="radio"
                      id={`slot-${i}-count-1`}
                      name={`slot-count-${i}`}
                      value={1}
                      checked={slot.count === 1}
                      onChange={() => setSlotCount(i, 1)}
                    />
                    <label htmlFor={`slot-${i}-count-1`}>1</label>
                    <input
                      type="radio"
                      id={`slot-${i}-count-2`}
                      name={`slot-count-${i}`}
                      value={2}
                      checked={slot.count === 2}
                      onChange={() => setSlotCount(i, 2)}
                    />
                    <label htmlFor={`slot-${i}-count-2`}>2</label>
                    <input
                      type="radio"
                      id={`slot-${i}-count-3`}
                      name={`slot-count-${i}`}
                      value={3}
                      checked={slot.count === 3}
                      onChange={() => setSlotCount(i, 3)}
                    />
                    <label htmlFor={`slot-${i}-count-3`}>3</label>
                  </fieldset>
                  <span className="slot-label">commits at this time</span>
                  <button
                    type="button"
                    className="slot-remove"
                    onClick={() => removeSlot(i)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {slotLimitMsg ? (
              <div className="slot-limit-msg">{slotLimitMsg}</div>
            ) : (
              <button type="button" className="slot-add" onClick={addSlot}>
                + Add slot
              </button>
            )}

            <div style={{ marginTop: 24 }}>
              <button className="btn-save" onClick={saveConfig}>
                Save Configuration
              </button>
              <span
                className={
                  "save-status" +
                  (saveStatus.kind === "ok"
                    ? " ok"
                    : saveStatus.kind === "err"
                      ? " err"
                      : "")
                }
              >
                {saveStatus.text}
              </span>
            </div>
          </div>

          <div className="section-label" id="dispatchSection">
            Step 2 · Instant dispatch
</div>
            <div className="panel" id="dispatchPanel">
              <h2>Fire a Commit Right Now</h2>
              <p className="panel-note">
                Creates one real commit in your connected repository immediately
                (no schedule needed).
              </p>
              {manualLimitMsg ? (
                <div className="slot-limit-msg">{manualLimitMsg}</div>
              ) : (
                <button
                  id="commitBtn"
                  className="primary-cta"
                  onClick={triggerCommit}
                  disabled={dispatch.busy}
                >
                  <span>→</span>
                  <span>{dispatch.btnText}</span>
                </button>
              )}
              <div className="reassurance-caption">
              Session: {sessionCount} · Manual Today:{" "}
              <span id="totalManual">{todayCount}</span>
            </div>
            <div
              id="consoleContainer"
              className={"console-container" + (dispatch.show ? " active" : "")}
            >
              <div className="console-top">
                <span id="consoleStatus">{dispatch.status}</span>
                <span id="consoleSha">{dispatch.sha}</span>
              </div>
              <div id="consoleBody" className="console-quote">
                {dispatch.quote ? `"${dispatch.quote}"` : ""}
                {dispatch.commitUrl && (
                  <>
                    <br />
                    <a
                      href={dispatch.commitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="console-link"
                    >
                      View Commit on GitHub ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="section-label" id="schedule">
            Your Burst Schedule
          </div>
          <div className="matrix-grid" id="matrixGrid">
            {matrixCards ? (
              matrixCards.map((slot, i) => (
                <div className="matrix-card" key={i}>
                  <div className="matrix-time">{slot.time}</div>
                  <div className="matrix-meta">
                    Burst {i + 1} · {slot.count} commits · {user!.timezone}
                  </div>
                </div>
              ))
            ) : (
              <div className="matrix-empty">
                No slots configured yet — add bursts in Step 1.
              </div>
            )}
          </div>
        </section>

        {/* ===== Feature Cards (both views) ===== */}
        <div className="section-label" id="features">
          Feature Surfaces
        </div>
        <div className="cards-grid">
          <div className="sticky-card card-mint">
            <div>
              <div className="card-tag">// 01 ISOLATION</div>
              <div className="card-heading">Per-User Isolation</div>
            </div>
            <div className="card-body">
              Your commits run with your own encrypted token against your own
              repo. No shared identity, no cross-user access — ever.
            </div>
          </div>
          <div className="sticky-card card-teal">
            <div>
              <div className="card-tag">// 02 INFRASTRUCTURE</div>
              <div className="card-heading">Serverless Engine</div>
            </div>
            <div className="card-body">
              Zero server maintenance. Next.js route handlers + Netlify
              scheduled heartbeat + GitHub API + Netlify Blobs store, all open
              source.
            </div>
          </div>
          <div className="sticky-card card-blush">
            <div>
              <div className="card-tag">// 03 ON-DEMAND</div>
              <div className="card-heading">Instant Dispatch</div>
            </div>
            <div className="card-body">
              Manual triggers execute instantly from your dashboard whenever you
              need an extra commit.
            </div>
          </div>
        </div>
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
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </div>
  );
}
