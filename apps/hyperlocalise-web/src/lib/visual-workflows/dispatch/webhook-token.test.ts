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
  buildVisualWorkflowWebhookUrl,
  createVisualWorkflowWebhookToken,
  verifyVisualWorkflowWebhookToken,
} from "./webhook-token";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";

describe("visual workflow webhook token", () => {
  it("is a 512-bit HMAC that verifies for its workflow and version only", () => {
    const token = createVisualWorkflowWebhookToken({
      visualWorkflowId: WORKFLOW_ID,
      tokenVersion: 1,
    });

    expect(Buffer.from(token, "base64url")).toHaveLength(64);
    expect(
      verifyVisualWorkflowWebhookToken({ visualWorkflowId: WORKFLOW_ID, tokenVersion: 1, token }),
    ).toBe(true);
    expect(
      verifyVisualWorkflowWebhookToken({ visualWorkflowId: WORKFLOW_ID, tokenVersion: 2, token }),
    ).toBe(false);
    expect(
      verifyVisualWorkflowWebhookToken({
        visualWorkflowId: "22222222-2222-4222-8222-222222222222",
        tokenVersion: 1,
        token,
      }),
    ).toBe(false);
  });

  it("rejects a token cut short or of another length", () => {
    const token = createVisualWorkflowWebhookToken({
      visualWorkflowId: WORKFLOW_ID,
      tokenVersion: 1,
    });

    for (const candidate of [token.slice(0, 43), `${token}A`, ""]) {
      expect(
        verifyVisualWorkflowWebhookToken({
          visualWorkflowId: WORKFLOW_ID,
          tokenVersion: 1,
          token: candidate,
        }),
      ).toBe(false);
    }
  });

  it("puts the token in the URL's query", () => {
    const url = new URL(
      buildVisualWorkflowWebhookUrl({
        origin: "https://app.example.com",
        visualWorkflowId: WORKFLOW_ID,
        tokenVersion: 3,
      }),
    );

    expect(url.pathname).toBe(`/api/webhooks/visual-workflows/${WORKFLOW_ID}`);
    expect(url.searchParams.get("token")).toBe(
      createVisualWorkflowWebhookToken({ visualWorkflowId: WORKFLOW_ID, tokenVersion: 3 }),
    );
  });
});
