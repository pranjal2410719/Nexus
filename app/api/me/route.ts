// GET /api/me — returns the authenticated user's config (never the encrypted token).
import { getUserByRequest, publicUser } from "@/lib/auth/user";
import { CORS_HEADERS, handleCors } from "@/lib/http/cors";
import { json } from "@/lib/http/response";

export async function GET(request: Request) {
  const cors = handleCors(request);
  if (cors) return cors;

  const user = await getUserByRequest(request);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  return json({ user: publicUser(user) });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
