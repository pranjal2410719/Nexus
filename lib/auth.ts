// Shared auth + storage layer.
// Blob keys: user:{githubId}, session:{sessionId}, oauth:{state}, counter:{githubId}:{date}
import { getStore, type Store } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { LocalFileStore } from "./local-blobs";

export const STORE_NAME = "nexus";
export const SESSION_COOKIE = "nexus_session";

export interface ScheduleSlot {
  /** "HH:MM" in the user's timezone, 24h format */
  time: string;
  /** number of commits in this burst (1–10) */
  count: number;
  /** ISO date (YYYY-MM-DD in user's tz) this slot last fired, for idempotency */
  lastRun: string | null;
}

export interface UserConfig {
  githubId: string;
  githubLogin: string;
  encryptedToken: string;
  owner: string;
  repo: string;
  targetFile: string;
  timezone: string;
  slots: ScheduleSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  userId: string;
  createdAt: string;
}

export type StoreMode = "netlify-blobs" | "local-file" | "unconfigured";

/**
 * How the blob store resolves for this process.
 * Shared by getStoreHandle() and the /api/health self-check.
 *
 * - "netlify-blobs": on Netlify (runtime injects NETLIFY_BLOBS_CONTEXT / NETLIFY_API_TOKEN)
 * - "local-file": `next dev` outside Netlify — file-backed store in `.data/blobs`
 * - "unconfigured": production outside Netlify — nothing to use
 */
export function getStoreMode(): StoreMode {
  const onNetlify =
    Boolean(process.env.NETLIFY_BLOBS_CONTEXT) || Boolean(process.env.NETLIFY_API_TOKEN);
  if (onNetlify) return "netlify-blobs";
  if (process.env.NODE_ENV === "development") return "local-file";
  return "unconfigured";
}

let storeCache: Store | null = null;

/**
 * Returns the blob store.
 *
 * - Production (Netlify runtime): real Netlify Blobs — the runtime injects
 *   NETLIFY_BLOBS_CONTEXT/NETLIFY_API_TOKEN, so getStore() reads them fresh.
 * - Local development (`next dev`, no Netlify env): a file-backed store in
 *   `.data/blobs` so the whole flow (OAuth, sessions, configs) works offline.
 */
export function getStoreHandle(): Store {
  if (!storeCache) {
    storeCache = createStoreHandle();
  }
  return storeCache;
}

function createStoreHandle(): Store {
  switch (getStoreMode()) {
    case "netlify-blobs":
      return getStore(STORE_NAME);
    case "local-file": {
      const dir = process.env.LOCAL_BLOBS_DIR || ".data/blobs";
      console.log("[nexus] Netlify Blobs env not detected — using local file store at", dir);
      return new LocalFileStore(dir) as unknown as Store;
    }
    default:
      throw new Error(
        "Blob store is not configured. Deploy on Netlify (env vars are injected automatically) " +
        "or run locally with `npm run dev` (file store) / `npx netlify dev`."
      );
  }
}

// ---------- Cookies ----------

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = value;
  }
  return out;
}

export function sessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}; Secure`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

// ---------- Sessions ----------

export async function createSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  const session: Session = { userId, createdAt: new Date().toISOString() };
  await getStoreHandle().set(`session:${sessionId}`, JSON.stringify(session));
  return sessionId;
}

export async function destroySession(request: Request): Promise<void> {
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) {
    await getStoreHandle().delete(`session:${sessionId}`).catch(() => undefined);
  }
}

// ---------- Users ----------

export async function getUserById(githubId: string): Promise<UserConfig | null> {
  const raw = await getStoreHandle().get(`user:${githubId}`, { type: "text" });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserConfig;
  } catch {
    return null;
  }
}

export async function saveUser(user: UserConfig): Promise<void> {
  await getStoreHandle().set(`user:${user.githubId}`, JSON.stringify(user));
}

/**
 * Returns the authenticated user for the request, or null.
 * This is the single isolation gate: every endpoint must resolve the user
 * through this function before touching any per-user data.
 */
export async function getUserByRequest(request: Request): Promise<UserConfig | null> {
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;

  const raw = await getStoreHandle().get(`session:${sessionId}`, { type: "text" });
  if (!raw) return null;
  let session: Session;
  try {
    session = JSON.parse(raw) as Session;
  } catch {
    return null;
  }
  return getUserById(session.userId);
}

/** Returns a copy of the user config safe to send to the client (no token). */
export function publicUser(user: UserConfig) {
  return {
    githubId: user.githubId,
    githubLogin: user.githubLogin,
    owner: user.owner,
    repo: user.repo,
    targetFile: user.targetFile,
    timezone: user.timezone,
    slots: user.slots,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
