// Logs the user out — destroys the session record and clears the cookie.
// POST /api/auth/logout (GET was removed to prevent CSRF via plain links)
import { clearSessionCookie } from "@/lib/auth/cookies";
import { CORS_HEADERS, handleCors } from "@/lib/http/cors";
import { destroySession } from "@/lib/auth/session";
import { json } from "@/lib/http/response";

export async function POST(request: Request) {
  const cors = handleCors(request);
  if (cors) return cors;

  await destroySession(request);
  return new Response(null, {
    status: 204,
    headers: {
      Location: "/",
      "Set-Cookie": clearSessionCookie(),
      ...CORS_HEADERS,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
