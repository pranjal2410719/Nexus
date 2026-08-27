import type { UserConfig } from "@/types/user";

/**
 * Whether this user is the designated admin. Controlled by the
 * ADMIN_GITHUB_LOGIN env var (e.g. "pranjal2410719"). Unset -> nobody is admin.
 */
export function isAdmin(user: Pick<UserConfig, "githubLogin">): boolean {
  const adminLogin = process.env.ADMIN_GITHUB_LOGIN;
  return Boolean(adminLogin && user.githubLogin === adminLogin);
}
