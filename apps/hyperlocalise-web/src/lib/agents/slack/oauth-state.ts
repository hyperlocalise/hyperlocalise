import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const SLACK_STATE_TTL_MS = 60 * 60 * 1000;

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

export async function createSlackState(
  slug: string,
  secret: string,
  nonce: string,
  timestamp = Date.now(),
): Promise<string> {
  const encodedSlug = encodeURIComponent(slug);
  const payload = `${encodedSlug}:${timestamp}:${nonce}`;
  return `${payload}:${await signSlackState(payload, secret)}`;
}

export async function verifySlackState(
  state: string,
  secret: string,
): Promise<{ slug: string; timestamp: number; nonce: string } | null> {
  const parts = state.split(":");
  if (parts.length !== 4) return null;

  const [encodedSlug, timestampStr, nonce, providedSignature] = parts;
  if (!encodedSlug || !timestampStr || !nonce || !providedSignature) return null;

  const payload = `${encodedSlug}:${timestampStr}:${nonce}`;
  const expectedSignature = await signSlackState(payload, secret);
  const enc = new TextEncoder();
  const providedBytes = enc.encode(providedSignature);
  const expectedBytes = enc.encode(expectedSignature);
  if (providedBytes.byteLength !== expectedBytes.byteLength) return null;
  if (!timingSafeEqual(providedBytes, expectedBytes)) return null;

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) return null;

  if (Date.now() - timestamp > SLACK_STATE_TTL_MS) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(encodedSlug);
  } catch {
    return null;
  }

  return { slug, timestamp, nonce };
}

export function getSlackStateSecret(): string {
  const secret = env.SLACK_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("missing SLACK_OAUTH_STATE_SECRET");
  }
  return secret;
}
