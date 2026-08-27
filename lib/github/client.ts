import { Octokit } from "@octokit/rest";

export function getOctokitClient(token: string): Octokit {
  return new Octokit({ auth: token });
}
