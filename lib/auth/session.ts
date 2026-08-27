import { randomUUID } from "node:crypto";
import { SESSION_COOKIE } from "@/config/constants";
import { getStoreHandle } from "@/lib/storage/blob-store";
import { parseCookies } from "./cookies";

export interface SessionData {
  userId: string;
  createdAt: string;
}

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
