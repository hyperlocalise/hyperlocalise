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

export async function signSlackState(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Buffer.from(signature).toString("base64");
}

export async function verifySlackState(
  state: string,
  secret: string,
): Promise<{ slug: string; timestamp: number } | null> {
  const parts = state.split(":");
  if (parts.length !== 3) return null;

  const [slug, timestampStr, providedSignature] = parts;
  if (!slug || !timestampStr || !providedSignature) return null;

  const payload = `${slug}:${timestampStr}`;
  const expectedSignature = await signSlackState(payload, secret);
  const enc = new TextEncoder();
  const providedBytes = enc.encode(providedSignature);
  const expectedBytes = enc.encode(expectedSignature);
  if (providedBytes.byteLength !== expectedBytes.byteLength) return null;
  if (!timingSafeEqual(providedBytes, expectedBytes)) return null;

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return null;

  if (Date.now() - timestamp > 60 * 60 * 1000) return null;

  return { slug, timestamp };
}

export function getSlackStateSecret(): string {
  const secret = env.SLACK_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("missing SLACK_OAUTH_STATE_SECRET");
  }
  return secret;
}
