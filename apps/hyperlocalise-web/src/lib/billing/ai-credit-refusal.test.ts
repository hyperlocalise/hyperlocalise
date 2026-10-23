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
