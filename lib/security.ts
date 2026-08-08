// Shared security helpers — encrypts user GitHub tokens at rest (AES-GCM).
// Uses BLOBS_MASTER_KEY set in env vars. A SHA-256 digest of the key
// material is used as the 32-byte AES key, so any length master key works.
import { webcrypto } from "node:crypto";

const encoder = new TextEncoder();

async function deriveKey(): Promise<Uint8Array> {
  const raw = process.env.BLOBS_MASTER_KEY ?? "";
  if (!raw) throw new Error("Missing env var: BLOBS_MASTER_KEY");
  const digest = await webcrypto.subtle.digest("SHA-256", encoder.encode(raw));
  return new Uint8Array(digest);
}

export async function encryptSecret(plain: string): Promise<string> {
  const keyBytes = await deriveKey();
  const key = await webcrypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain));

  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(cipher).toString("base64")}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [ivB64, dataB64] = payload.split(".");
  if (!ivB64 || !dataB64) throw new Error("Malformed encrypted payload");

  const keyBytes = await deriveKey();
  const key = await webcrypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]
  );
  const plain = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(ivB64, "base64") },
    key,
    Buffer.from(dataB64, "base64")
  );

  return Buffer.from(plain).toString("utf-8");
}
