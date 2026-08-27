export type StoreMode =
  | "netlify-blobs"
  | "local-file"
  | "unconfigured"
  | "blobs"
  | "memory"
  | "fallback"
  | "local"
  | "netlify";

export interface Session {
  githubId: string;
  createdAt: number;
}

export interface CookieOptions {
  name: string;
  value: string;
  path?: string;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number;
  secure?: boolean;
}
