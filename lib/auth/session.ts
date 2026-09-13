import { randomUUID } from "node:crypto";
import { SESSION_COOKIE } from "@/config/constants";
import { getStoreHandle } from "@/lib/storage/blob-store";
import { parseCookies } from "./cookies";

export interface SessionData {
  userId: string;
  createdAt: string;
}

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  const session: SessionData = { userId, createdAt: new Date().toISOString() };
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

export async function destroyAllSessions(userId: string): Promise<void> {
  const store = getStoreHandle();
  // Get all sessions, then filter and delete
  const allPages: Array<{ key: string }> = [];
  for await (const page of store.list({ prefix: "session:", paginate: true })) {
    for (const { key } of page.blobs) {
      allPages.push({ key });
    }
  }
  // Now process allPages sequentially (no async iterable type issue)
  for (const { key } of allPages) {
    const raw = await store.get(key, { type: "text" });
    if (!raw) continue;
    try {
      const session = JSON.parse(raw) as SessionData;
      if (session.userId === userId) {
        await store.delete(key).catch(() => undefined);
      }
    } catch {
      // Skip corrupt records
    }
  }
}

export function isSessionExpired(session: SessionData): boolean {
  const createdAt = Date.parse(session.createdAt);
  if (Number.isNaN(createdAt)) return true;
  return Date.now() - createdAt > SESSION_MAX_AGE_MS;
}