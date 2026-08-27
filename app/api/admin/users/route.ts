// GET /api/admin/users — admin-only: lists every registered user (tokens stay encrypted).
import { getStoreHandle } from "@/lib/storage/blob-store";
import { getUserByRequest, publicUser } from "@/lib/auth/user";
import { isAdmin } from "@/lib/auth/permissions";
import { CORS_HEADERS, handleCors } from "@/lib/http/cors";
import { json } from "@/lib/http/response";
import type { PublicUser } from "@/types/user";

export async function GET(request: Request) {
  const cors = handleCors(request);
  if (cors) return cors;

  const user = await getUserByRequest(request);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!isAdmin(user)) {
    return json({ error: "Forbidden — admin only." }, 403);
  }

  try {
    const store = getStoreHandle();
    const users: PublicUser[] = [];
    const pages = store.list({ prefix: "user:", paginate: true });
    for await (const page of pages) {
      for (const { key } of page.blobs) {
        const raw = await store.get(key, { type: "text" });
        if (!raw) continue;
        try {
          users.push(publicUser(JSON.parse(raw)));
        } catch {
          // skip corrupt records
        }
      }
    }
    users.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json({ users });
  } catch (err: any) {
    console.error("Admin users fetch failed:", err);
    return json({ error: err.message }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
