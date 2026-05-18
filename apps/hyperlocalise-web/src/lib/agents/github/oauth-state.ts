import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const GITHUB_STATE_TTL_MS = 60 * 60 * 1000;

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function signGitHubState(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Buffer.from(signature).toString("base64");
}

export async function verifyGitHubState(
  state: string,
  secret: string,
): Promise<{ slug: string; timestamp: number; nonce: string } | null> {
  const parts = state.split(":");
  if (parts.length !== 4) return null;

  const [slug, timestampStr, nonce, providedSignature] = parts;
  if (!slug || !timestampStr || !nonce || !providedSignature) return null;

  const payload = `${slug}:${timestampStr}:${nonce}`;
  const expectedSignature = await signGitHubState(payload, secret);
  const enc = new TextEncoder();
  const providedBytes = enc.encode(providedSignature);
  const expectedBytes = enc.encode(expectedSignature);
  if (providedBytes.byteLength !== expectedBytes.byteLength) return null;
  if (!timingSafeEqual(providedBytes, expectedBytes)) return null;

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return null;

  if (Date.now() - timestamp > GITHUB_STATE_TTL_MS) return null;

  return { slug, timestamp, nonce };
}

export function getGitHubStateSecret(): string {
  const secret = env.GITHUB_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("missing GITHUB_OAUTH_STATE_SECRET");
  }
  return secret;
}
