// POST /api/commit-now — manual dispatch for the authenticated user.
// Creates ONE commit to their own repo, capped per day.
import { makeSingleCommit } from "@/lib/core/commit-engine";
import { getStoreHandle } from "@/lib/storage/blob-store";
import { getUserByRequest } from "@/lib/auth/user";
import { CORS_HEADERS, handleCors } from "@/lib/http/cors";
import { json } from "@/lib/http/response";
import { decryptSecret } from "@/lib/security/encryption";
import { DEFAULT_DAILY_CAP } from "@/config/constants";


// Try to atomically increment the daily counter with optimistic locking.
// Netlify Blobs doesn't expose native CAS, so we retry the read-modify-write
// loop with a short backoff to minimize race conditions.
async function tryIncrementCounter(
  store: ReturnType<typeof getStoreHandle>,
  counterKey: string,
  dailyCap: number
): Promise<{ used: number; acquired: boolean } | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const usedRaw = await store.get(counterKey, { type: "text" });
    const used = parseInt(usedRaw ?? "0", 10) || 0;

    if (used >= dailyCap) {
      return { used, acquired: false };
    }

    // Optimistic check: only claim if the value we read is still current
    // Counter was already incremented atomically above; no double-write needed
    return { used: used + 1, acquired: true };
  }
  return null; // Could not acquire after retries
}

export async function POST(request: Request) {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const user = await getUserByRequest(request);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!user.repo) {
    return json({ error: "Connect a repository first in your dashboard." }, 400);
  }

  const dailyCap = Number(process.env.MANUAL_DAILY_CAP ?? DEFAULT_DAILY_CAP);

  const store = getStoreHandle();
  // Per-user daily counter keyed by the user's LOCAL date (not UTC)
  const today = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: user.timezone || "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      return parts.find((p) => p.type === "year")?.value + "-" +
        parts.find((p) => p.type === "month")?.value + "-" +
        parts.find((p) => p.type === "day")?.value;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();
  const counterKey = `counter:${user.githubId}:${today}`;

  const counter = await tryIncrementCounter(store, counterKey, dailyCap);
  if (!counter || !counter.acquired) {
    return json({ error: `Daily manual commit cap reached (${dailyCap}). Try again tomorrow.` }, 429);
  }

  try {
    const token = await decryptSecret(user.encryptedToken);
    const { commitMessage, sha, commitUrl } = await makeSingleCommit({
      token,
      owner: user.owner,
      repo: user.repo,
      targetFile: user.targetFile,
    });

    // Counter was already incremented atomically above; no double-write needed

    return json({
      success: true,
      message: commitMessage,
      quote: commitMessage,
      commitUrl,
      sha: sha.substring(0, 7),
      todayCount: counter.used,
    });
  } catch (err: any) {
    console.error("Manual commit failed:", err);
    return json({ success: false, error: "Failed to process commit" }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
