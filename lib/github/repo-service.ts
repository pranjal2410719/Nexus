import type { Repo } from "@/types/github";
import { getOctokitClient } from "./client";
import type { Octokit } from "@octokit/rest";

export async function listUserRepos(
  token: string,
  fallbackOwner: string,
  client?: Octokit
): Promise<Repo[]> {
  const octokit = client ?? getOctokitClient(token);
  const repos: Repo[] = [];

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
        owner: r.owner?.login ?? fallbackOwner,
        private: r.private ?? false,
      });
    }

    if (data.length < 100) break;
  }

  return repos;
}
