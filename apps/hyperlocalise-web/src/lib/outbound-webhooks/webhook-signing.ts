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
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signatures follow the Standard Webhooks spec (https://www.standardwebhooks.com), so receivers
 * can verify with any of its libraries: `webhook-id`, `webhook-timestamp` (unix seconds) and
 * `webhook-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body">`.
 */
export const WEBHOOK_SECRET_PREFIX = "whsec_";
const WEBHOOK_SECRET_BYTES = 32;

export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(WEBHOOK_SECRET_BYTES).toString("base64")}`;
}

function secretKey(secret: string): Buffer {
  const encoded = secret.startsWith(WEBHOOK_SECRET_PREFIX)
    ? secret.slice(WEBHOOK_SECRET_PREFIX.length)
    : secret;
  return Buffer.from(encoded, "base64");
}

export function signWebhookPayload(input: {
  secret: string;
  messageId: string;
  timestampSeconds: number;
  body: string;
}): string {
  const signature = createHmac("sha256", secretKey(input.secret))
    .update(`${input.messageId}.${input.timestampSeconds}.${input.body}`)
    .digest("base64");
  return `v1,${signature}`;
}

export function buildWebhookHeaders(input: {
  secret: string;
  messageId: string;
  timestampSeconds: number;
  body: string;
}): Record<string, string> {
  return {
    "content-type": "application/json",
    "user-agent": "Hyperlocalise-Webhooks/1.0",
    "webhook-id": input.messageId,
    "webhook-timestamp": String(input.timestampSeconds),
    "webhook-signature": signWebhookPayload(input),
  };
}

/** Receiver-side check, used by tests and the docs example. */
export function verifyWebhookSignature(input: {
  secret: string;
  messageId: string;
  timestampSeconds: number;
  body: string;
  signatureHeader: string;
}): boolean {
  const expected = Buffer.from(signWebhookPayload(input));
  return input.signatureHeader.split(" ").some((candidate) => {
    const actual = Buffer.from(candidate);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
