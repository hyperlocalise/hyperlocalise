import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

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
): Promise<{ slug: string; timestamp: number } | null> {
  const parts = state.split(":");
  if (parts.length !== 3) return null;

  const [slug, timestampStr, providedSignature] = parts;
  if (!slug || !timestampStr || !providedSignature) return null;

  const payload = `${slug}:${timestampStr}`;
  const expectedSignature = await signGitHubState(payload, secret);
  const enc = new TextEncoder();
  if (!timingSafeEqual(enc.encode(providedSignature), enc.encode(expectedSignature))) return null;

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return null;

  // Expire states after 1 hour.
  if (Date.now() - timestamp > 60 * 60 * 1000) return null;

  return { slug, timestamp };
}

export function getGitHubStateSecret(): string {
  const secret = env.GITHUB_OAUTH_STATE_SECRET ?? env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("missing GITHUB_OAUTH_STATE_SECRET or GITHUB_APP_WEBHOOK_SECRET");
  }
  return secret;
}
