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

function encodeSignature(signature: ArrayBuffer): string {
  return Buffer.from(signature).toString("base64url");
}

function decodeSignatureBytes(value: string): Buffer | null {
  const normalized = value.replace(/ /g, "+");

  for (const candidate of [value, normalized]) {
    for (const encoding of ["base64url", "base64"] as const) {
      try {
        return Buffer.from(candidate, encoding);
      } catch {
        // Try the next encoding variant.
      }
    }
  }

  return null;
}

function signatureBytesMatch(providedSignature: string, expectedSignature: string): boolean {
  const providedBytes = decodeSignatureBytes(providedSignature);
  const expectedBytes = decodeSignatureBytes(expectedSignature);

  if (!providedBytes || !expectedBytes) {
    return false;
  }

  if (providedBytes.byteLength !== expectedBytes.byteLength) {
    return false;
  }

  return timingSafeEqual(providedBytes, expectedBytes);
}

export async function signGitHubState(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return encodeSignature(signature);
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
  if (!signatureBytesMatch(providedSignature, expectedSignature)) return null;

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
