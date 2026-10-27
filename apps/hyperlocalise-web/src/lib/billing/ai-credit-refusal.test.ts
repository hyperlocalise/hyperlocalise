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
import { DefaultChatTransport } from "ai";
import { describe, expect, it } from "vite-plus/test";

import { ApiResponseError } from "@/lib/api-error";

import { isAiCreditExhaustedError } from "./ai-credit-refusal";

describe("isAiCreditExhaustedError", () => {
  it("recognises an API error with the refusal code", () => {
    expect(
      isAiCreditExhaustedError(
        new ApiResponseError("used up", { code: "ai_credit_exhausted", status: 402 }),
      ),
    ).toBe(true);
  });

  it("recognises the refused body kept on an AI SDK chat call error", () => {
    expect(
      isAiCreditExhaustedError({
        statusCode: 402,
        responseBody: JSON.stringify({ error: "ai_credit_exhausted", message: "used up" }),
      }),
    ).toBe(true);
  });

  it("recognises the error the AI SDK chat transport throws for a refused request", async () => {
    const transport = new DefaultChatTransport({
      api: "/api/orgs/acme/conversations/conv_1/chat",
      fetch: async () =>
        Response.json(
          {
            error: "ai_credit_exhausted",
            message: "Your workspace has used all of its AI credit.",
          },
          { status: 402 },
        ),
    });

    const sent = transport.sendMessages({
      chatId: "conv_1",
      messageId: undefined,
      messages: [{ id: "msg_1", role: "user", parts: [{ type: "text", text: "hello" }] }],
      trigger: "submit-message",
      abortSignal: undefined,
    });

    const error = await sent.then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isAiCreditExhaustedError(error)).toBe(true);
  });

  it("ignores other failures", () => {
    expect(
      isAiCreditExhaustedError(
        new ApiResponseError("not on plan", { code: "ai_features_required", status: 403 }),
      ),
    ).toBe(false);
    expect(isAiCreditExhaustedError({ responseBody: "<html>Bad gateway</html>" })).toBe(false);
    expect(isAiCreditExhaustedError(new Error("ai_credit_exhausted"))).toBe(false);
    expect(isAiCreditExhaustedError(null)).toBe(false);
  });
});
