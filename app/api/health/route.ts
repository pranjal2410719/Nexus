// GET /api/health — lightweight self-check.
// Reports which store mode is active, which env vars are configured, and does a
// write/read/delete round-trip through the store. Never leaks secret values —
// env vars are reported as presence flags only.
import { getStoreHandle, getStoreMode, type StoreMode } from "@/lib/auth";
import { CORS_HEADERS, json } from "@/lib/http";

function envFlag(name: string): "configured" | "missing" {
  return process.env[name] ? "configured" : "missing";
}

export async function GET() {
  const mode = getStoreMode();

  const store: { mode: StoreMode; roundtrip: "ok" | "error" | "n/a"; detail?: string } = {
    mode,
    roundtrip: "n/a",
  };

  // Only touch the store when one is actually configured.
  if (mode !== "unconfigured") {
    const probeKey = `health:${Date.now()}`;
    try {
      const handle = getStoreHandle();
      await handle.set(probeKey, "ok");
      const read = await handle.get(probeKey, { type: "text" });
      await handle.delete(probeKey);
      store.roundtrip = read === "ok" ? "ok" : "error";
      if (read !== "ok") store.detail = `round-trip returned: ${JSON.stringify(read)}`;
    } catch (err: any) {
      store.roundtrip = "error";
      store.detail = err?.message ?? String(err);
    }
  }

  const manualDailyCap = process.env.MANUAL_DAILY_CAP;
  const env = {
    GITHUB_CLIENT_ID: envFlag("GITHUB_CLIENT_ID"),
    GITHUB_CLIENT_SECRET: envFlag("GITHUB_CLIENT_SECRET"),
    BLOBS_MASTER_KEY: envFlag("BLOBS_MASTER_KEY"),
    MANUAL_DAILY_CAP: manualDailyCap ? manualDailyCap : envFlag("MANUAL_DAILY_CAP"),
  };

  const ok =
    env.GITHUB_CLIENT_ID === "configured" &&
    env.GITHUB_CLIENT_SECRET === "configured" &&
    env.BLOBS_MASTER_KEY === "configured" &&
    store.roundtrip !== "error";

  return json(
    {
      ok,
      service: "nexus",
      node: process.version,
      environment: process.env.NODE_ENV ?? "unknown",
      onNetlify: Boolean(
        process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY_API_TOKEN
      ),
      store,
      env,
      note: "env values are presence flags only — secrets are never returned",
    },
    ok ? 200 : 503
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
