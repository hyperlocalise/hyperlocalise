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
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

const WEBHOOK_KEY_INFO = "hyperlocalise:visual-workflow-webhook-token:v2";
const WEBHOOK_KEY_BYTES = 64;

let webhookKey: Buffer | undefined;

/**
 * A key used only for webhook tokens, derived from the master key, so a token never reveals
 * anything about the master key or a key derived from it for another purpose. Rotating the master
 * key changes every webhook URL.
 */
function webhookSigningKey(): Buffer {
  webhookKey ??= Buffer.from(
    hkdfSync(
      "sha512",
      env.PROVIDER_CREDENTIALS_MASTER_KEY,
      Buffer.alloc(0),
      WEBHOOK_KEY_INFO,
      WEBHOOK_KEY_BYTES,
    ),
  );
  return webhookKey;
}

/** The secret in a workflow's webhook URL. A new `tokenVersion` makes the old URL stop working. */
export function createVisualWorkflowWebhookToken(input: {
  visualWorkflowId: string;
  tokenVersion: number;
}): string {
  return createHmac("sha512", webhookSigningKey())
    .update(`${input.visualWorkflowId}:${input.tokenVersion}`)
    .digest("base64url");
}

export function verifyVisualWorkflowWebhookToken(input: {
  visualWorkflowId: string;
  tokenVersion: number;
  token: string;
}): boolean {
  const expected = Buffer.from(createVisualWorkflowWebhookToken(input));
  const actual = Buffer.from(input.token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildVisualWorkflowWebhookUrl(input: {
  origin: string;
  visualWorkflowId: string;
  tokenVersion: number;
}): string {
  const url = new URL(
    `/api/webhooks/visual-workflows/${encodeURIComponent(input.visualWorkflowId)}`,
    input.origin,
  );
  url.searchParams.set("token", createVisualWorkflowWebhookToken(input));
  return url.toString();
}
