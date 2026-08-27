// GET /api/repos — lists the authenticated user's repos
// so the onboarding UI can offer a repo picker.
import { getUserByRequest } from "@/lib/auth/user";
import { listUserRepos } from "@/lib/github/repo-service";
import { CORS_HEADERS, handleCors } from "@/lib/http/cors";
import { json } from "@/lib/http/response";
import { decryptSecret } from "@/lib/security/encryption";

export async function GET(request: Request) {
  const cors = handleCors(request);
  if (cors) return cors;

  const user = await getUserByRequest(request);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const token = await decryptSecret(user.encryptedToken);
    const repos = await listUserRepos(token, user.githubLogin);
    return json({ repos });
  } catch (err: any) {
    console.error("Failed to list repos:", err);
    return json({ error: err.message }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
