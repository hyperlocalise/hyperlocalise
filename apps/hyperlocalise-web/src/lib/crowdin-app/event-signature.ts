/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export type CrowdinAppEventSignatureError =
  | "crowdin_app_not_configured"
  | "crowdin_event_signature_missing"
  | "crowdin_event_signature_invalid";

function normalizeSignature(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");
}

function signaturesMatch(provided: string, expectedHex: string) {
  const normalized = normalizeSignature(provided);
  const expectedBuffer = Buffer.from(expectedHex, "utf8");
  const providedBuffer = Buffer.from(normalized, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Verify Crowdin App lifecycle event authenticity.
 * Crowdin signs the raw JSON body with HMAC-SHA256 using the OAuth client secret.
 */
export function verifyCrowdinAppEventSignature(input: {
  rawBody: string;
  contentChecksumHeader?: string | null;
  signatureHeader?: string | null;
}): { ok: true } | { error: CrowdinAppEventSignatureError } {
  const secret = env.CROWDIN_APP_CLIENT_SECRET?.trim();
  if (!secret) {
    return { error: "crowdin_app_not_configured" };
  }

  const provided = input.contentChecksumHeader?.trim() || input.signatureHeader?.trim();
  if (!provided) {
    return { error: "crowdin_event_signature_missing" };
  }

  const expectedHex = createHmac("sha256", secret).update(input.rawBody, "utf8").digest("hex");
  if (!signaturesMatch(provided, expectedHex)) {
    return { error: "crowdin_event_signature_invalid" };
  }

  return { ok: true };
}
