/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const GSC_STATE_TTL_MS = 60 * 60 * 1000;

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function encodeSignature(signature: ArrayBuffer): string {
  return Buffer.from(signature).toString("base64url");
}

export async function signGscState(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encodeSignature(signature);
}

export async function createGscOAuthState(input: {
  organizationSlug: string;
  returnTo: string;
  nonce: string;
  secret: string;
  timestamp?: number;
}) {
  const timestamp = input.timestamp ?? Date.now();
  const payload = `${input.organizationSlug}:${timestamp}:${input.nonce}:${input.returnTo}`;
  const signature = await signGscState(payload, input.secret);
  return `${payload}:${signature}`;
}

export async function verifyGscOAuthState(
  state: string,
  secret: string,
): Promise<{ organizationSlug: string; returnTo: string; nonce: string } | null> {
  const parts = state.split(":");
  if (parts.length < 5) {
    return null;
  }

  const signature = parts.at(-1);
  const organizationSlug = parts[0];
  const timestampStr = parts[1];
  const nonce = parts[2];
  const returnTo = parts.slice(3, -1).join(":");
  if (!signature || !organizationSlug || !timestampStr || !nonce) {
    return null;
  }

  const payload = `${organizationSlug}:${timestampStr}:${nonce}:${returnTo}`;
  const expectedSignature = await signGscState(payload, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > GSC_STATE_TTL_MS) {
    return null;
  }

  return { organizationSlug, returnTo, nonce };
}

export function getGscOAuthStateSecret(): string {
  return (
    env.GSC_OAUTH_STATE_SECRET ??
    env.GITHUB_OAUTH_STATE_SECRET ??
    env.WORKOS_COOKIE_PASSWORD ??
    ""
  );
}

export function getGscRedirectUri(requestUrl: string) {
  if (env.GOOGLE_OAUTH_REDIRECT_URI) {
    return env.GOOGLE_OAUTH_REDIRECT_URI;
  }
  return `${new URL(requestUrl).origin}/api/auth/gsc/callback`;
}
