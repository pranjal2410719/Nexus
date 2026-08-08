// GET /api/repos — lists the authenticated user's repos
// so the onboarding UI can offer a repo picker.
import { Octokit } from "@octokit/rest";
import { getUserByRequest } from "@/lib/auth";
import { CORS_HEADERS, handleCors, json } from "@/lib/http";
import { decryptSecret } from "@/lib/security";

export async function GET(request: Request) {
  const cors = handleCors(request);
  if (cors) return cors;

  const user = await getUserByRequest(request);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const token = await decryptSecret(user.encryptedToken);
    const octokit = new Octokit({ auth: token });

    // Paginate so users with 100+ repos still see everything in the picker.
    const repos: Array<{ full_name: string; name: string; owner: string; private: boolean }> = [];
    for (let page = 1; page <= 10; page++) {
      const { data } = await octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        page,
        sort: "updated",
        affiliation: "owner,collaborator,organization_member",
      });
      for (const r of data) {
        repos.push({
          full_name: r.full_name,
          name: r.name,
          owner: r.owner?.login ?? user.githubLogin,
          private: r.private ?? false,
        });
      }
      if (data.length < 100) break;
    }

    return json({ repos });
  } catch (err: any) {
    console.error("Failed to list repos:", err);
    return json({ error: err.message }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
