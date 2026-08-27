import type { PublicUser, UserConfig } from "@/types/user";
import { SESSION_COOKIE } from "@/config/constants";
import { getStoreHandle } from "@/lib/storage/blob-store";
import { parseCookies } from "./cookies";
import { isAdmin } from "./permissions";
import type { SessionData } from "./session";

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
  let session: SessionData;
  try {
    session = JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
  return getUserById(session.userId);
}

/** Returns a copy of the user config safe to send to the client (no token). */
export function publicUser(user: UserConfig): PublicUser {
  return {
    githubId: user.githubId,
    githubLogin: user.githubLogin,
    isAdmin: isAdmin(user),
    owner: user.owner,
    repo: user.repo,
    targetFile: user.targetFile,
    timezone: user.timezone,
    slots: user.slots,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
