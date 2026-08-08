// Development-only file-backed blob store.
//
// Used by getStoreHandle() when running with `next dev` outside Netlify, so the
// full OAuth → session → dashboard → commit flow works locally with just a
// `.env` (no Netlify CLI required). Production always uses real Netlify Blobs.
//
// Each key is stored as one JSON file in a local directory (default `.data/blobs`).
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ListPage {
  blobs: Array<{ key: string }>;
}

export class LocalFileStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  private path(key: string): string {
    // Keys are namespaced like user:123, session:uuid, oauth:uuid, counter:123:2026-08-08
    const safe = key.replace(/[^A-Za-z0-9_.:-]/g, "_");
    return join(this.dir, `${safe}.json`);
  }

  async get(key: string, opts?: { type?: "text" | "json" }): Promise<string | null | unknown> {
    try {
      const raw = readFileSync(this.path(key), "utf8");
      if (opts?.type === "json") {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return raw;
    } catch (err: any) {
      if (err?.code === "ENOENT") return null;
      throw err;
    }
  }

  async set(key: string, value: string): Promise<void> {
    writeFileSync(this.path(key), typeof value === "string" ? value : JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    try {
      unlinkSync(this.path(key));
    } catch {
      // already gone
    }
  }

  async *list(opts: { prefix?: string; paginate?: boolean }): AsyncIterable<ListPage> {
    let files: string[] = [];
    try {
      files = readdirSync(this.dir);
    } catch {
      // dir missing → no keys
    }
    const keys = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter((k) => !opts.prefix || k.startsWith(opts.prefix))
      .sort();
    yield { blobs: keys.map((key) => ({ key })) };
  }
}
