import type { StoreMode } from "./auth";

export interface StoreStatus {
  mode: StoreMode;
  roundtrip: "ok" | "error" | "n/a";
  detail?: string;
}

export interface HealthEnv {
  GITHUB_CLIENT_ID: "configured" | "missing";
  GITHUB_CLIENT_SECRET: "configured" | "missing";
  BLOBS_MASTER_KEY: "configured" | "missing";
  MANUAL_DAILY_CAP: string;
}

export interface HealthReport {
  ok: boolean;
  service: string;
  node: string;
  environment: string;
  onNetlify: boolean;
  store: StoreStatus;
  env: HealthEnv;
  note: string;
}
