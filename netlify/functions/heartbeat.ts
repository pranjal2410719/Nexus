// HEARTBEAT SCHEDULER — runs every 15 minutes on Netlify Scheduled Functions.
//
// Netlify scheduled functions are STATIC (defined at deploy time), so we cannot
// create per-user crons. Instead this single function:
//   1. Lists all user records from the Blob store
//   2. For each user, checks which schedule slots are due in the current
//      15-minute window (in the user's own timezone)
//   3. Fires those slots with the user's OWN encrypted token
//   4. Marks slot.lastRun so no user is double-committed
//
// Isolation: the engine always runs with the user's own credentials; no shared
// GitHub identity is ever used.
import { makeBatchCommits } from "@/lib/core/commit-engine";
import { getStoreHandle } from "@/lib/storage/blob-store";
import { json } from "@/lib/http/response";
import { decryptSecret } from "@/lib/security/encryption";
import type { UserConfig, ScheduleSlot } from "@/types/user";

export const config = { schedule: "*/15 * * * *" };

// Stay well under the ~15s free-tier timeout (each commit ≈ 0.3–0.6s API time).
const BUDGET_MS = 12_000;
// Safety cap on how many users one tick processes.
const MAX_USERS_PER_TICK = 50;

/** Returns the given date's wall-clock parts in the user's IANA timezone. */
export function zonedParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

export function zonedDayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Determines whether a slot is due.
 * Checks candidate occurrences for today, yesterday, and tomorrow relative to now
 * within ±15 minutes, returning the matched target date key if due, or null if not due.
 */
export function getDueTargetDateKey(
  slot: ScheduleSlot,
  now: Date,
  timeZone: string
): string | null {
  const p = zonedParts(now, timeZone);
  const [hh, mm] = slot.time.split(":").map(Number);
  const slotMin = hh * 60 + mm;
  const nowMin = p.hour * 60 + p.minute;

  // 1. Check today's candidate
  const todayKey = zonedDayKey(now, timeZone);
  const diffToday = nowMin - slotMin;
  if (Math.abs(diffToday) <= 15) {
    return slot.lastRun === todayKey ? null : todayKey;
  }

  // 2. Check tomorrow's candidate (now is near midnight 23:50, slot is next day 00:05)
  const diffTomorrow = (nowMin - 1440) - slotMin;
  if (Math.abs(diffTomorrow) <= 15) {
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowKey = zonedDayKey(tomorrowDate, timeZone);
    return slot.lastRun === tomorrowKey ? null : tomorrowKey;
  }

  // 3. Check yesterday's candidate (now is near midnight 00:05, slot is previous day 23:55)
  const diffYesterday = (nowMin + 1440) - slotMin;
  if (Math.abs(diffYesterday) <= 15) {
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = zonedDayKey(yesterdayDate, timeZone);
    return slot.lastRun === yesterdayKey ? null : yesterdayKey;
  }

  return null;
}

export function isSlotDue(
  slot: ScheduleSlot,
  now: Date,
  timeZone: string
): boolean {
  return getDueTargetDateKey(slot, now, timeZone) !== null;
}

export default async () => {
  const started = Date.now();
  const store = getStoreHandle();
  const now = new Date();

  const stats = {
    usersProcessed: 0,
    slotsFired: 0,
    commitsCommitted: 0,
    errors: [] as string[],
  };
  let processed = 0;

  try {
    const pages = store.list({ prefix: "user:", paginate: true });
    for await (const page of pages) {
      for (const { key } of page.blobs) {
        if (processed >= MAX_USERS_PER_TICK || Date.now() - started > BUDGET_MS) break;

        // Per-user try/catch: one corrupt tenant must NEVER halt the platform.
        try {
          const raw = await store.get(key, { type: "text" });
          if (!raw) continue;
          let user: UserConfig;
          try {
            user = JSON.parse(raw) as UserConfig;
          } catch {
            continue;
          }

          if (!user.encryptedToken || !user.repo) continue; // incomplete onboarding

          const timezone = user.timezone || "Asia/Kolkata";
          let token: string | null = null;

          for (const slot of user.slots ?? []) {
            const targetDateKey = getDueTargetDateKey(slot, now, timezone);
            if (!targetDateKey) continue;

            const previousLastRun = slot.lastRun;
            // WRITE-AHEAD: mark and save the slot as run BEFORE executing commits
            // so function timeouts or crashes never cause duplicate commit storms.
            slot.lastRun = targetDateKey;
            user.updatedAt = new Date().toISOString();
            await store.set(key, JSON.stringify(user));
            stats.slotsFired++;

            try {
              if (!token) {
                token = await decryptSecret(user.encryptedToken);
              }

              const result = await makeBatchCommits(
                { token, owner: user.owner, repo: user.repo, targetFile: user.targetFile },
                slot.count,
                `${slot.time} ${timezone}`
              );

              stats.commitsCommitted += result.committed;
              if (result.committed === 0) {
                // If 0 commits succeeded, rollback lastRun so it can retry later
                slot.lastRun = previousLastRun;
                user.updatedAt = new Date().toISOString();
                await store.set(key, JSON.stringify(user));
              }
              if (result.errors.length) {
                stats.errors.push(...result.errors.map((e) => `${key}: ${e}`));
              }
            } catch (commitErr: any) {
              // Rollback on unexpected commit error
              slot.lastRun = previousLastRun;
              user.updatedAt = new Date().toISOString();
              await store.set(key, JSON.stringify(user));
              stats.errors.push(`${key}: ${commitErr.message}`);
            }

            if (Date.now() - started > BUDGET_MS) break;
          }

          processed++;
          stats.usersProcessed++;
        } catch (err: any) {
          stats.errors.push(`${key}: ${err.message}`);
          processed++;
        }
      }

      if (Date.now() - started > BUDGET_MS || processed >= MAX_USERS_PER_TICK) break;
    }
  } catch (err: any) {
    console.error("Heartbeat failed:", err);
    return json({ error: err.message, ...stats }, 500);
  }

  console.log("[heartbeat]", JSON.stringify(stats));
  return json({ ok: true, ...stats });
};
