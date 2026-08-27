// Step 1 of GitHub OAuth — redirects the user to GitHub's authorize screen.
// GET /api/auth/start
import { randomUUID } from "node:crypto";
import { getStoreHandle } from "@/lib/storage/blob-store";

function siteOrigin(request: Request): string {
  return process.env.URL ?? process.env.NETLIFY_URL ?? new URL(request.url).origin;
}

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID ?? "";
  if (!clientId) {
    return new Response(
      "Server not configured: missing GITHUB_CLIENT_ID. " +
        "Create a GitHub OAuth App at https://github.com/settings/developers and set " +
        "GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET in your .env (local) or Netlify env vars (deployed). " +
        "Callback URL: https://YOUR-SITE.netlify.app/api/auth/callback (or http://localhost:3000/api/auth/callback for local dev).",
      { status: 500 }
    );
  }

  const state = randomUUID();
  // Keep the state in the Blob store so the callback can verify it (CSRF protection).
  await getStoreHandle().set(`oauth:${state}`, JSON.stringify({ createdAt: Date.now() }));

  const redirectUri = `${siteOrigin(request)}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo",
    state,
  });

  return Response.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`, 302);
}
