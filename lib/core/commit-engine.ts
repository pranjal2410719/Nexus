// Commit engine — generates realistic developer activity logs & real git commit messages.
// Multi-tenant: every function receives an explicit user config (token, owner, repo, file),
// so one engine instance can serve thousands of isolated users.
import { Octokit } from "@octokit/rest";
import type {
  CommitConfig,
  SingleCommitResult,
  BatchResult,
  LogEntry,
} from "@/types/commit";
import { generateRealLogEntry, getTimestamp } from "./task-generator";
import { sanitizePath, pruneEntries } from "./log-pruner";

export { sanitizePath, pruneEntries, generateRealLogEntry, getTimestamp };
export type { CommitConfig, SingleCommitResult, BatchResult, LogEntry };

/**
 * Safely fetches the current target file content and its GitHub Blob SHA.
 * Guarantees that sha is returned whenever the file exists on GitHub (even if empty).
 */
export async function fetchCurrentFile(
  config: CommitConfig
): Promise<{ content: string; sha?: string }> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sanitized = sanitizePath(config.targetFile);
  try {
    const { data } = await octokit.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: sanitized,
    });

    if (Array.isArray(data)) {
      throw new Error(`Target path "${config.targetFile}" is a directory, not a file.`);
    }

    if (typeof data !== "object" || data === null || (data as any).type !== "file") {
      throw new Error(`Target path "${config.targetFile}" is not a regular file.`);
    }

    let content = "";
    if (typeof (data as any).content === "string") {
      content = Buffer.from((data as any).content, "base64").toString("utf-8");
    }

    return {
      content,
      sha: (data as any).sha,
    };
  } catch (err: any) {
    if (err.status === 404) {
      return { content: "" }; // file does not exist yet — will be created with sha: undefined
    }
    throw err;
  }
}

/**
 * Makes a single commit to the target file. Returns message/sha/url for UI feedback.
 * Correctly passes existing blob SHA when updating, or undefined when creating new files.
 */
export async function makeSingleCommit(
  config: CommitConfig,
  messageSuffix?: string
): Promise<SingleCommitResult> {
  const octokit = config.client ?? new Octokit({ auth: config.token });
  const sanitized = sanitizePath(config.targetFile);
  const normalizedConfig: CommitConfig = { ...config, targetFile: sanitized, client: octokit };

  const { content: currentContent, sha } = await fetchCurrentFile(normalizedConfig);

  const { commitMessage, logContent } = generateRealLogEntry();
  const fullMessage = messageSuffix ? `${commitMessage} ${messageSuffix}` : commitMessage;

  let newContent: string;
  if (currentContent && currentContent.length > 0) {
    newContent = currentContent.endsWith("\n")
      ? currentContent + logContent.replace(/^\n/, "")
      : currentContent + logContent;
  } else {
    newContent = `# DSA Practice & Build Activity Log\n\n${logContent.replace(/^\n/, "")}`;
  }

  newContent = pruneEntries(newContent, 5);

  const params: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
  } = {
    owner: normalizedConfig.owner,
    repo: normalizedConfig.repo,
    path: normalizedConfig.targetFile,
    message: fullMessage,
    content: Buffer.from(newContent).toString("base64"),
  };

  if (sha) {
    params.sha = sha;
  }

  const { data } = await octokit.repos.createOrUpdateFileContents(params);

  return {
    commitMessage: fullMessage,
    sha: data.commit?.sha ?? "",
    commitUrl: data.commit?.html_url ?? "",
  };
}

/**
 * Makes `count` sequential commits to the user's target file.
 * Automatically keeps only the last 5 entries in a rolling loop.
 */
export async function makeBatchCommits(
  config: CommitConfig,
  count: number,
  label: string = "batch"
): Promise<BatchResult> {
  if (count <= 0) {
    return { committed: 0, errors: [], lastSha: undefined, lastCommitUrl: undefined };
  }

  const octokit = config.client ?? new Octokit({ auth: config.token });
  const batchConfig: CommitConfig = { ...config, client: octokit };
  let committed = 0;
  const errors: string[] = [];
  let lastSha: string | undefined;
  let lastCommitUrl: string | undefined;

  for (let i = 1; i <= count; i++) {
    try {
      const { sha, commitUrl } = await makeSingleCommit(batchConfig, `[${label} ${i}/${count}]`);
      lastSha = sha;
      lastCommitUrl = commitUrl;
      committed++;
    } catch (err: any) {
      errors.push(`Commit ${i} failed: ${err.message}`);
    }
  }

  return { committed, errors, lastSha, lastCommitUrl };
}
