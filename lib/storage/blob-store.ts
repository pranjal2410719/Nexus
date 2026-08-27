// Shared storage layer — Netlify Blobs / Local File Store abstraction.
import { getStore, type Store } from "@netlify/blobs";
import { STORE_NAME } from "@/config/constants";
import { LocalFileStore } from "./local-file-store";

import type { StoreMode } from "@/types/auth";

export type { StoreMode };

/**
 * How the blob store resolves for this process.
 * Shared by getStoreHandle() and the /api/health self-check.
 *
 * - "netlify-blobs": on Netlify (runtime injects NETLIFY_BLOBS_CONTEXT / NETLIFY_API_TOKEN)
 * - "local-file": `next dev` outside Netlify — file-backed store in `.data/blobs`
 * - "unconfigured": production outside Netlify — nothing to use
 */
export function getStoreMode(): StoreMode {
  const onNetlify =
    Boolean(process.env.NETLIFY_BLOBS_CONTEXT) || Boolean(process.env.NETLIFY_API_TOKEN);
  if (onNetlify) return "netlify-blobs";
  if (process.env.NODE_ENV === "development" || !process.env.NETLIFY) return "local-file";
  return "unconfigured";
}

let storeCache: Store | null = null;

/**
 * Returns the blob store.
 *
 * - Production (Netlify runtime): real Netlify Blobs — the runtime injects
 *   NETLIFY_BLOBS_CONTEXT/NETLIFY_API_TOKEN, so getStore() reads them fresh.
 * - Local development (`next dev`, no Netlify env): a file-backed store in
 *   `.data/blobs` so the whole flow (OAuth, sessions, configs) works offline.
 */
export function getStoreHandle(): Store {
  if (!storeCache) {
    storeCache = createStoreHandle();
  }
  return storeCache;
}

function createStoreHandle(): Store {
  switch (getStoreMode()) {
    case "netlify-blobs":
      return getStore(STORE_NAME);
    case "local-file": {
      const dir = process.env.LOCAL_BLOBS_DIR || ".data/blobs";
      return new LocalFileStore(dir) as unknown as Store;
    }
    default:
      throw new Error(
        "Blob store is not configured. Deploy on Netlify (env vars are injected automatically) " +
        "or run locally with `npm run dev` (file store) / `npx netlify dev`."
      );
  }
}
