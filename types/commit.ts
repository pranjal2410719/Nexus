import type { Octokit } from "@octokit/rest";

export interface CommitConfig {
  token: string;
  owner: string;
  repo: string;
  targetFile: string;
  client?: Octokit;
}

export interface LogEntry {
  commitMessage: string;
  logContent: string;
}

export interface SingleCommitResult {
  commitMessage: string;
  sha: string;
  commitUrl: string;
}

export interface BatchResult {
  committed: number;
  errors: string[];
  lastSha?: string;
  lastCommitUrl?: string;
}
