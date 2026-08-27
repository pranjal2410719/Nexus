"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { Navbar } from "@/components/dashboard/navbar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { HeroBanner } from "@/components/dashboard/hero-banner";
import { ConfigForm } from "@/components/dashboard/config-form";
import { DispatchConsole } from "@/components/dashboard/dispatch-console";
import { ScheduleMatrix } from "@/components/dashboard/schedule-matrix";
import { FeatureCards } from "@/components/dashboard/feature-cards";
import { RepoIcon, LockIcon } from "@/components/ui/icons";
import { type MenuOption } from "@/components/ui/menu-select";
import { TIMEZONES, DEFAULT_TIMEZONE, DEFAULT_TARGET_FILE } from "@/config/constants";
import { siteConfig } from "@/config/site";
import type { PublicUser, Repo, ScheduleSlot, UserConfig } from "@/types";

export default function Home() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState("");
  const [repoVal, setRepoVal] = useState("");
  const [targetFile, setTargetFile] = useState(DEFAULT_TARGET_FILE);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [flashMsg, setFlashMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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

  const todayKey = `nexus_manual_${new Date().toISOString().slice(0, 10)}`;

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
  async function loadRepos(u: PublicUser | UserConfig) {
    setReposLoading(true);
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
        setRepoVal(cur);
      } else if (list.length > 0) {
        setRepoVal(`${list[0].owner}/${list[0].name}`);
      }
    } catch (err: any) {
      setRepos([]);
      setReposError(err.message || "Failed to load repos");
    } finally {
      setReposLoading(false);
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
    if (!user) return;
    if (!repoVal) {
      setSaveStatus({ text: "Select a repository first", kind: "err" });
      return;
    }
    const [owner, repo] = repoVal.split("/");
    if (!owner || !repo) {
      setSaveStatus({ text: "Invalid repo choice", kind: "err" });
      return;
    }

    setSaveStatus({ text: "Saving…", kind: "" });
    try {
      const res = await fetch("/api/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          targetFile,
          timezone,
          slots,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setUser(data.user);
      setSaveStatus({ text: "✓ Configuration saved", kind: "ok" });
      setTimeout(() => setSaveStatus({ text: "", kind: "" }), 3000);
    } catch (err: any) {
      setSaveStatus({ text: `✗ ${err.message}`, kind: "err" });
    }
  }

  // ---------- Trigger instant commit ----------
  async function triggerCommit() {
    if (!user) return;
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
        const newToday = typeof data.todayCount === "number" ? data.todayCount : todayCount + 1;
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

  // ---------- Boot ----------
  useEffect(() => {
    (async () => {
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
          const u = data.user as PublicUser;
          setUser(u);
          setTargetFile(u.targetFile || DEFAULT_TARGET_FILE);
          setTimezone(u.timezone || DEFAULT_TIMEZONE);
          setSlots(u.slots ?? []);
          loadRepos(u);
        }
      } catch {
        // stay logged out
      }
      setLoading(false);
    })();
  }, []);

  const loggedIn = !!user;
  const showLoader = loading || (loggedIn && reposLoading);

  const repoOptions: MenuOption[] = (() => {
    const list: MenuOption[] = repos.map((r) => ({
      value: `${r.owner}/${r.name}`,
      label: `${r.owner}/${r.name}`,
      hint: r.private ? "private" : "public",
      icon: r.private ? <LockIcon /> : <RepoIcon />,
    }));
    if (user?.owner && user?.repo) {
      const cur = `${user.owner}/${user.repo}`;
      if (!list.some((o) => o.value === cur)) {
        list.unshift({
          value: cur,
          label: `${cur} (configured)`,
          hint: "saved",
          icon: <RepoIcon />,
        });
      }
    }
    return list;
  })();

  const timezoneOptions: MenuOption[] = TIMEZONES.map((tz) => ({
    value: tz,
    label: tz,
  }));

  const totalCommitsScheduled = slots.reduce((acc, s) => acc + s.count, 0);
  const dashSub =
    user?.repo && slots.length > 0
      ? `Configured to commit to ${user.owner}/${user.repo} · ${slots.length} burst${slots.length === 1 ? "" : "s"} (${totalCommitsScheduled} commit${totalCommitsScheduled === 1 ? "" : "s"}/day)`
      : user?.repo
        ? `Configured to commit to ${user.owner}/${user.repo} · no schedule bursts configured`
        : "Connect a repository below to get started.";

  return (
    <div className="wrap">
      {showLoader && <Loader label="Booting commit studio…" />}

      <Navbar
        user={user}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(!menuOpen)}
        sourceUrl={siteConfig.sourceUrl}
      />

      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        sourceUrl={siteConfig.sourceUrl}
      />

      <main>
        {flashMsg && <div className="flash err">{flashMsg}</div>}

        <HeroBanner visible={!loggedIn && !loading} />

        {loggedIn && (
          <section id="dashView">
            <div className="dash-head">
              <div>
                <div className="dash-title">Your Commit Studio</div>
                <div className="dash-sub">{dashSub}</div>
              </div>
            </div>

            <div className="section-label" id="configSection">
              Step 1 · Connect your repository
            </div>

            <ConfigForm
              repoVal={repoVal}
              setRepoVal={setRepoVal}
              repoOptions={repoOptions}
              reposLoading={reposLoading}
              reposError={reposError}
              targetFile={targetFile}
              setTargetFile={setTargetFile}
              timezone={timezone}
              setTimezone={setTimezone}
              timezoneOptions={timezoneOptions}
              slots={slots}
              addSlot={addSlot}
              removeSlot={removeSlot}
              setSlotTime={setSlotTime}
              setSlotCount={setSlotCount}
              slotLimitMsg={slotLimitMsg}
              saveConfig={saveConfig}
              saveStatus={saveStatus}
            />

            <div className="section-label" id="dispatchSection">
              Step 2 · Instant dispatch
            </div>

            <DispatchConsole
              manualLimitMsg={manualLimitMsg}
              dispatch={dispatch}
              triggerCommit={triggerCommit}
              sessionCount={sessionCount}
              todayCount={todayCount}
            />

            <ScheduleMatrix slots={slots} timezone={timezone} />
          </section>
        )}

        <FeatureCards />
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
