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
  addCliTokenUsage,
  appendHlRunReportOutput,
  parseCliTokenUsage,
  sandboxTranslationBillingMetadata,
  withCliBillingMetadata,
} from "@/lib/translation/cli-token-usage";

describe("CLI token usage", () => {
  it("appends a quoted summary report path to hl run", () => {
    expect(appendHlRunReportOutput("hl run --progress off", "/tmp/hl-run-report.json")).toBe(
      "hl run --progress off --output '/tmp/hl-run-report.json' --output-detail summary",
    );
  });

  it("parses exclusive CLI token pools including compatibility aliases", () => {
    expect(
      parseCliTokenUsage({
        promptTokens: 40,
        completionTokens: 12,
        cachedInputTokens: 8,
        cacheWriteInputTokens: 4,
        reasoningTokens: 3,
        totalTokens: 67,
      }),
    ).toEqual({
      inputTokens: 28,
      outputTokens: 9,
      totalTokens: 52,
      cacheReadTokens: 8,
      cacheWriteTokens: 4,
      reasoningTokens: 3,
    });
  });

  it("returns null when the CLI report has no billable tokens", () => {
    expect(parseCliTokenUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })).toBeNull();
    expect(parseCliTokenUsage(null)).toBeNull();
  });

  it("adds page-level CLI reports for paginated sandbox runs", () => {
    expect(
      addCliTokenUsage(
        {
          inputTokens: 10,
          outputTokens: 4,
          totalTokens: 14,
          cacheReadTokens: 2,
          modelId: "openai/gpt-5.6-luna",
          credentialSource: "gateway",
        },
        { inputTokens: 5, outputTokens: 1, totalTokens: 9, reasoningTokens: 3 },
      ),
    ).toEqual({
      inputTokens: 15,
      outputTokens: 5,
      totalTokens: 23,
      cacheReadTokens: 2,
      reasoningTokens: 3,
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
    });
  });

  it("records BYOK sandbox runs against the organization model at $0", () => {
    expect(
      sandboxTranslationBillingMetadata({
        provider: "anthropic",
        apiKey: "sk-ant-test",
        model: "claude-sonnet-4-6",
      }),
    ).toEqual({
      modelId: "claude-sonnet-4-6",
      credentialSource: "byok",
    });
  });

  it("attaches the managed gateway model to platform sandbox usage", () => {
    expect(withCliBillingMetadata({ inputTokens: 2, outputTokens: 1, totalTokens: 3 })).toEqual({
      inputTokens: 2,
      outputTokens: 1,
      totalTokens: 3,
      modelId: "openai/gpt-5.6-luna",
      credentialSource: "gateway",
    });
  });
});
