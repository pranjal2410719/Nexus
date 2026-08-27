// Logs the user out — destroys the session record and clears the cookie.
// GET /api/auth/logout
import { clearSessionCookie } from "@/lib/auth/cookies";
import { destroySession } from "@/lib/auth/session";

export async function GET(request: Request) {
  await destroySession(request);
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": clearSessionCookie() },
  });
}
