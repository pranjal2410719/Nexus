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
import { makeBatchCommits } from "../../lib/commit-helper";
import { getStoreHandle, type UserConfig } from "../../lib/auth";
import { json } from "../../lib/http";
import { decryptSecret } from "../../lib/security";

export const config = { schedule: "*/15 * * * *" };

// Stay well under the ~15s free-tier timeout (each commit ≈ 0.3–0.6s API time).
const BUDGET_MS = 12_000;
// Safety cap on how many users one tick processes.
const MAX_USERS_PER_TICK = 50;

/** Returns the given date's wall-clock parts in the user's IANA timezone. */
function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
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
    fmt.formatToParts(date)
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

function zonedDayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * A slot "HH:MM" is due if the current minute is within ±15 minutes of it and
 * it hasn't already fired today. 15-min window guarantees the heartbeat tick
 * (every 15 min) always catches it exactly once thanks to the lastRun guard.
 */
function isSlotDue(slot: { time: string; lastRun: string | null }, now: Date, timeZone: string): boolean {
  const p = zonedParts(now, timeZone);
  const [hh, mm] = slot.time.split(":").map(Number);
  const slotMin = hh * 60 + mm;
  const nowMin = p.hour * 60 + p.minute;

  const today = zonedDayKey(now, timeZone);
  if (slot.lastRun === today) return false;

  // Distance on a 24h clock — due within ±15 minutes.
  const delta = ((nowMin - slotMin) % 1440 + 1440) % 1440;
  return delta <= 15 || delta >= 1440 - 15;
}

export default async () => {
  const started = Date.now();
  const store = getStoreHandle();
  const now = new Date();

  const stats = { usersProcessed: 0, slotsFired: 0, commitsCommitted: 0, errors: [] as string[] };
  let processed = 0;

  try {
    // Blob store list() with paginate:true streams every user key.
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
          const dayKey = zonedDayKey(now, timezone);
          let changed = false;

          for (const slot of user.slots ?? []) {
            if (!isSlotDue(slot, now, timezone)) continue;

            // WRITE-AHEAD: mark the slot as run BEFORE executing so a timeout
            // mid-batch can never cause duplicate commits on the next tick.
            // If nothing is committed we unmark it, so the slot retries later.
            slot.lastRun = dayKey;
            changed = true;
            stats.slotsFired++;

            const token = await decryptSecret(user.encryptedToken);
            const result = await makeBatchCommits(
              { token, owner: user.owner, repo: user.repo, targetFile: user.targetFile },
              slot.count,
              `${slot.time} ${timezone}`
            );

            stats.commitsCommitted += result.committed;
            if (result.committed === 0) {
              slot.lastRun = null; // allow retry on a later tick
            }
            if (result.errors.length) stats.errors.push(...result.errors.map((e) => `${key}: ${e}`));

            if (Date.now() - started > BUDGET_MS) break;
          }

          if (changed) {
            user.updatedAt = new Date().toISOString();
            await store.set(key, JSON.stringify(user));
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
