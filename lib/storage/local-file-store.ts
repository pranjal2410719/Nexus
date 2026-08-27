// Development-only file-backed blob store.
// Used by getStoreHandle() when running locally, so the
// full OAuth -> session -> dashboard -> commit flow works locally with just a
// `.env` (no Netlify CLI required). Production uses real Netlify Blobs.
//
// Each key is stored as one JSON file in a local directory (default `.data/blobs`).
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface ListPage {
  blobs: Array<{ key: string }>;
}

export class LocalFileStore {
  private dir: string;
  private dirInitialized: boolean = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  private async ensureDir(): Promise<void> {
    if (this.dirInitialized) return;
    try {
      await mkdir(this.dir, { recursive: true });
      this.dirInitialized = true;
    } catch {
      // ignore
    }
  }

  private path(key: string): string {
    // Keys are namespaced like user:123, session:uuid, oauth:uuid, counter:123:2026-08-08
    const safe = key.replace(/[^A-Za-z0-9_.:-]/g, "_");
    return join(this.dir, `${safe}.json`);
  }

  async get(key: string, opts?: { type?: "text" | "json" }): Promise<string | null | unknown> {
    try {
      const raw = await readFile(this.path(key), "utf8");
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
    await this.ensureDir();
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    try {
      await writeFile(this.path(key), payload, "utf8");
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        this.dirInitialized = false;
        await this.ensureDir();
        await writeFile(this.path(key), payload, "utf8");
      } else {
        throw err;
      }
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch {
      // already gone
    }
  }

  async *list(opts: { prefix?: string; paginate?: boolean }): AsyncIterable<ListPage> {
    let files: string[] = [];
    try {
      files = await readdir(this.dir);
    } catch {
      // dir missing -> no keys
    }
    const keys = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter((k) => !opts.prefix || k.startsWith(opts.prefix))
      .sort();
    yield { blobs: keys.map((key) => ({ key })) };
  }
}
