// HEARTBEAT SCHEDULER — runs every 15 minutes on Netlify Scheduled Functions.
//
// Netlify scheduled functions are STATIC (defined at deploy time), so we cannot
// create per-user crons. Instead this single function:
//   1. Lists all user records from the Blob store (numerically sorted)
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
 * Checks only today's candidate within ±15 minutes, relying on lastRun
 * to prevent duplicate firings across midnight boundaries.
 * This eliminates the midnight double-fire bug from the previous ±15
 * circular-clock implementation.
 */
export function isSlotDue(
  slot: ScheduleSlot,
  now: Date,
  timeZone: string
): boolean {
  const p = zonedParts(now, timeZone);
  const [hh, mm] = slot.time.split(":").map(Number);
  const slotMin = hh * 60 + mm;
  const nowMin = p.hour * 60 + p.minute;

  const diff = nowMin - slotMin;
  if (Math.abs(diff) <= 15) {
    const todayKey = zonedDayKey(now, timeZone);
    return slot.lastRun !== todayKey;
  }
  return false;
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

  try {
    // Collect ALL user keys and sort numerically to prevent
    // lexicographic starvation (user:1, user:10, user:100, user:2, ...)
    const allKeys: string[] = [];
  for await (const page of store.list({ prefix: "user:", paginate: true })) {
    for (const { key } of page.blobs) {
      allKeys.push(key);
    }
  }

    // Sort by numeric ID: user:1 → user:2 → user:10 → user:100
    allKeys.sort((a: string, b: string) => {
      const idA = parseInt(a.substring(5), 10);
      const idB = parseInt(b.substring(5), 10);
      return idA - idB;
    });

    // Randomize start offset to distribute load evenly across ticks
    const startIndex = Math.floor(Math.random() * Math.max(allKeys.length, 1));
    const orderedKeys = [
      ...allKeys.slice(startIndex),
      ...allKeys.slice(0, startIndex),
    ];

    let processed = 0;
    for (const key of orderedKeys) {
      if (processed >= MAX_USERS_PER_TICK || Date.now() - started > BUDGET_MS) break;

      // Per-user try/catch: one corrupt tenant must NEVER halt the platform.
      try {
        const raw = await store.get(key, { type: "text" });
        if (!raw) continue;
        let user: UserConfig;
        try {
          user = JSON.parse(raw) as UserConfig;
        } catch {
          continue; // Skip corrupt records
        }

        if (!user.encryptedToken || !user.repo) continue; // incomplete onboarding
        if (!user.slots || user.slots.length === 0) continue; // no schedule

        // Validate slot counts to prevent infinite retries or budget blowouts
        const validSlots = user.slots.filter(
          (s) => s.count >= 1 && s.count <= 3 && s.time && /^\d{2}:\d{2}$/.test(s.time)
        );
        if (validSlots.length === 0) continue;

        const timezone = user.timezone || "Asia/Kolkata";
        let token: string | null = null;

        for (const slot of validSlots) {
          if (!isSlotDue(slot, now, timezone)) continue;

          const previousLastRun = slot.lastRun;
          // WRITE-AHEAD: mark and save the slot as run BEFORE executing commits
          // so function timeouts or crashes never cause duplicate commit storms.
          slot.lastRun = zonedDayKey(new Date(), timezone);
          user.updatedAt = new Date().toISOString();
          await store.set(key, JSON.stringify(user));
          stats.slotsFired++;

          try {
            if (!token) {
              token = await decryptSecret(user.encryptedToken);
            }

            // Validate count is within safe bounds before executing
            const batchCount = Math.min(slot.count, 10); // Hard cap at 10 per burst

            const result = await makeBatchCommits(
              { token, owner: user.owner, repo: user.repo, targetFile: user.targetFile },
              batchCount,
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
  } catch (err: any) {
    console.error("Heartbeat failed:", err);
    return json({ error: err.message, ...stats }, 500);
  }

  console.log("[heartbeat]", JSON.stringify(stats));
  return json({ ok: true, ...stats });
};
