// Step 2 of GitHub OAuth — callback that exchanges the code for an access token,
// stores the user record (token encrypted at rest), and sets the session cookie.
// GET /api/auth/callback?code=...&state=...
import { Octokit } from "@octokit/rest";
import { createSession, getStoreHandle, saveUser, sessionCookie, type UserConfig } from "@/lib/auth";
import { encryptSecret } from "@/lib/security";

function siteOrigin(request: Request): string {
  return process.env.URL ?? process.env.NETLIFY_URL ?? new URL(request.url).origin;
}

function redirect(url: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, { status: 302, headers: { Location: url, ...extraHeaders } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirect(`${siteOrigin(request)}/?error=missing_params`);
  }

  // Verify state (CSRF protection) + expiry (10 min) so abandoned OAuth flows
  // don't accumulate in the store forever.
  const store = getStoreHandle();
  const stateRecord = await store.get(`oauth:${state}`, { type: "text" });
  if (!stateRecord) {
    return redirect(`${siteOrigin(request)}/?error=invalid_state`);
  }
  await store.delete(`oauth:${state}`);
  const stateCreated = (() => {
    try {
      return (JSON.parse(stateRecord) as { createdAt?: number }).createdAt ?? 0;
    } catch {
      return 0;
    }
  })();
  if (Date.now() - stateCreated > 10 * 60 * 1000) {
    return redirect(`${siteOrigin(request)}/?error=state_expired`);
  }

  const clientId = process.env.GITHUB_CLIENT_ID ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    return redirect(`${siteOrigin(request)}/?error=server_not_configured`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return redirect(`${siteOrigin(request)}/?error=oauth_failed&detail=${tokenData.error ?? "no_token"}`);
    }

    const octokit = new Octokit({ auth: tokenData.access_token });
    const { data: ghUser } = await octokit.users.getAuthenticated();

    const githubId = String(ghUser.id);

    // Preserve existing config (repo, slots, timezone) on re-login; refresh token + login.
    const existing = await store.get(`user:${githubId}`, { type: "json" }).then(
      (r) => r as UserConfig | null,
      () => null
    );

    const encryptedToken = await encryptSecret(tokenData.access_token);

    const user: UserConfig = {
      githubId,
      githubLogin: ghUser.login,
      encryptedToken,
      owner: existing?.owner ?? ghUser.login,
      repo: existing?.repo ?? "",
      targetFile: existing?.targetFile ?? "PROGRESS_LOG.md",
      timezone: existing?.timezone ?? "Asia/Kolkata",
      slots: existing?.slots ?? [
        { time: "09:00", count: 3, lastRun: null },
        { time: "10:00", count: 3, lastRun: null },
        { time: "23:20", count: 3, lastRun: null },
        { time: "23:59", count: 3, lastRun: null },
      ],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveUser(user);

    const sessionId = await createSession(githubId);
    return redirect(`${siteOrigin(request)}/?logged_in=1`, { "Set-Cookie": sessionCookie(sessionId) });
  } catch (err: any) {
    console.error("OAuth callback failed:", err);
    return redirect(`${siteOrigin(request)}/?error=callback_failed`);
  }
}
