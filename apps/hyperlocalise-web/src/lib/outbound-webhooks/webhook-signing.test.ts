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
import { describe, expect, it } from "vite-plus/test";

import {
  WEBHOOK_SECRET_PREFIX,
  buildWebhookHeaders,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./webhook-signing";

describe("webhook signing", () => {
  it("generates prefixed 32-byte secrets", () => {
    const secret = generateWebhookSecret();
    expect(secret.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
    expect(Buffer.from(secret.slice(WEBHOOK_SECRET_PREFIX.length), "base64")).toHaveLength(32);
    expect(generateWebhookSecret()).not.toBe(secret);
  });

  it("matches the Standard Webhooks reference vector", () => {
    // From https://github.com/standard-webhooks/standard-webhooks test vectors.
    expect(
      signWebhookPayload({
        secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
        messageId: "msg_p5jXN8AQM9LWM0D4loKWxJek",
        timestampSeconds: 1614265330,
        body: '{"test": 2432232314}',
      }),
    ).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("builds headers a receiver can verify, and rejects a changed body", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ id: "evt", type: "job.created" });
    const headers = buildWebhookHeaders({ secret, messageId: "msg_1", timestampSeconds: 1, body });
    expect(headers["webhook-id"]).toBe("msg_1");
    expect(headers["webhook-timestamp"]).toBe("1");

    const check = (candidateBody: string) =>
      verifyWebhookSignature({
        secret,
        messageId: "msg_1",
        timestampSeconds: 1,
        body: candidateBody,
        signatureHeader: headers["webhook-signature"]!,
      });
    expect(check(body)).toBe(true);
    expect(check(`${body} `)).toBe(false);
  });
});
