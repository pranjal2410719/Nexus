// Mock GitHub / Octokit engine for offline E2E opaque-box testing.
import { createHash, randomBytes } from "node:crypto";

export function computeGitBlobSha(content) {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const header = `blob ${buf.length}\0`;
  const store = Buffer.concat([Buffer.from(header, "utf8"), buf]);
  return createHash("sha1").update(store).digest("hex");
}

export function computeCommitSha() {
  return randomBytes(20).toString("hex");
}

export class MockGitHubRepoStore {
  constructor() {
    this.repos = new Map(); // `${owner}/${repo}` -> Map of `path` -> { content: string, sha: string, commits: [] }
    this.users = new Map(); // token -> { id: number, login: string, name: string }
    this.repoLists = new Map(); // token -> Array of repo objects
    this.injectedErrors = new Map(); // `${op}:${path}` -> Error
    this.callLog = [];
  }

  setFile(owner, repo, filePath, content) {
    const repoKey = `${owner}/${repo}`;
    if (!this.repos.has(repoKey)) {
      this.repos.set(repoKey, new Map());
    }
    const sha = computeGitBlobSha(content);
    this.repos.get(repoKey).set(filePath, {
      content,
      sha,
      commits: [{ sha: computeCommitSha(), message: "initial commit", timestamp: new Date().toISOString() }],
    });
    return sha;
  }

  getFile(owner, repo, filePath) {
    const repoKey = `${owner}/${repo}`;
    return this.repos.get(repoKey)?.get(filePath) ?? null;
  }

  setUser(token, userData) {
    this.users.set(token, userData);
  }

  setUserRepos(token, repoList) {
    this.repoLists.set(token, repoList);
  }

  injectError(op, key, error) {
    this.injectedErrors.set(`${op}:${key}`, error);
  }

  clearInjectedErrors() {
    this.injectedErrors.clear();
  }

  createOctokit(token) {
    const store = this;
    return {
      repos: {
        getContent: async ({ owner, repo, path }) => {
          store.callLog.push({ method: "repos.getContent", owner, repo, path, token });
          const errKey = `getContent:${owner}/${repo}/${path}`;
          if (store.injectedErrors.has(errKey)) {
            throw store.injectedErrors.get(errKey);
          }

          const file = store.getFile(owner, repo, path);
          if (!file) {
            const notFoundErr = new Error("Not Found");
            notFoundErr.status = 404;
            throw notFoundErr;
          }

          return {
            status: 200,
            data: {
              type: "file",
              encoding: "base64",
              size: Buffer.from(file.content, "utf8").length,
              name: path.split("/").pop(),
              path,
              content: Buffer.from(file.content, "utf8").toString("base64"),
              sha: file.sha,
            },
          };
        },

        createOrUpdateFileContents: async ({ owner, repo, path, message, content, sha }) => {
          store.callLog.push({ method: "repos.createOrUpdateFileContents", owner, repo, path, message, sha, token });
          const errKey = `createOrUpdateFileContents:${owner}/${repo}/${path}`;
          if (store.injectedErrors.has(errKey)) {
            throw store.injectedErrors.get(errKey);
          }

          const repoKey = `${owner}/${repo}`;
          if (!store.repos.has(repoKey)) {
            store.repos.set(repoKey, new Map());
          }
          const files = store.repos.get(repoKey);
          const existing = files.get(path);

          // If file exists and SHA was not supplied or mismatches -> 409 Conflict
          if (existing && sha && existing.sha !== sha) {
            const conflictErr = new Error(`sha "${sha}" does not match current "${existing.sha}"`);
            conflictErr.status = 409;
            throw conflictErr;
          }

          const decodedContent = Buffer.from(content, "base64").toString("utf8");
          const newBlobSha = computeGitBlobSha(decodedContent);
          const newCommitSha = computeCommitSha();

          const commitEntry = {
            sha: newCommitSha,
            message,
            timestamp: new Date().toISOString(),
          };

          const fileData = {
            content: decodedContent,
            sha: newBlobSha,
            commits: existing ? [...existing.commits, commitEntry] : [commitEntry],
          };

          files.set(path, fileData);

          return {
            status: existing ? 200 : 201,
            data: {
              content: {
                name: path.split("/").pop(),
                path,
                sha: newBlobSha,
                size: Buffer.from(decodedContent, "utf8").length,
              },
              commit: {
                sha: newCommitSha,
                message,
                html_url: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
              },
            },
          };
        },

        listForAuthenticatedUser: async ({ per_page = 100, page = 1 } = {}) => {
          store.callLog.push({ method: "repos.listForAuthenticatedUser", token, per_page, page });
          const list = store.repoLists.get(token) || [
            {
              full_name: "testuser/nexus-activity",
              name: "nexus-activity",
              owner: { login: "testuser" },
              private: false,
            },
          ];
          const start = (page - 1) * per_page;
          const paginated = list.slice(start, start + per_page);
          return { status: 200, data: paginated };
        },
      },

      users: {
        getAuthenticated: async () => {
          store.callLog.push({ method: "users.getAuthenticated", token });
          const user = store.users.get(token) || {
            id: 99887766,
            login: "testuser",
            name: "Test User",
            email: "testuser@example.com",
          };
          return { status: 200, data: user };
        },
      },
    };
  }
}
