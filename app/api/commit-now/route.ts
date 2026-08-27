// POST /api/commit-now — manual dispatch for the authenticated user.
// Creates ONE commit to their own repo, capped per day.
import { makeSingleCommit } from "@/lib/core/commit-engine";
import { getStoreHandle } from "@/lib/storage/blob-store";
import { getUserByRequest } from "@/lib/auth/user";
import { CORS_HEADERS, handleCors } from "@/lib/http/cors";
import { json } from "@/lib/http/response";
import { decryptSecret } from "@/lib/security/encryption";
import { DEFAULT_DAILY_CAP } from "@/config/constants";

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

  // Per-user daily counter (keyed by UTC date is fine for a soft cap)
  const today = new Date().toISOString().slice(0, 10);
  const counterKey = `counter:${user.githubId}:${today}`;
  const store = getStoreHandle();
  const usedRaw = await store.get(counterKey, { type: "text" });
  const used = parseInt(usedRaw ?? "0", 10) || 0;

  if (used >= dailyCap) {
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

    await store.set(counterKey, String(used + 1));

    return json({
      success: true,
      message: commitMessage,
      quote: commitMessage,
      commitUrl,
      sha: sha.substring(0, 7),
      todayCount: used + 1,
    });
  } catch (err: any) {
    console.error("Manual commit failed:", err);
    return json({ success: false, error: err.message }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
