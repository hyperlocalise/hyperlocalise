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
import type { LanguageModelUsage } from "ai";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { Context, ContextCacheUsage, ContextReasoningUsage } from "./context";

function renderUsageMarkup({
  children,
  usage,
}: {
  children: React.ReactNode;
  usage: LanguageModelUsage;
}) {
  return renderToStaticMarkup(
    <IntlProvider locale="en" messages={{}}>
      <Context maxTokens={100_000} usage={usage} usedTokens={500}>
        {children}
      </Context>
    </IntlProvider>,
  );
}

describe("Context token detail usage", () => {
  it("renders reasoning tokens from AI SDK v7 output token details", () => {
    const markup = renderUsageMarkup({
      children: <ContextReasoningUsage />,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        outputTokenDetails: {
          reasoningTokens: 42,
        },
      } as LanguageModelUsage,
    });

    expect(markup).toContain("Reasoning");
    expect(markup).toContain("42");
  });

  it("renders cache tokens from AI SDK v7 input token details", () => {
    const markup = renderUsageMarkup({
      children: <ContextCacheUsage />,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        inputTokenDetails: {
          cacheReadTokens: 128,
        },
      } as LanguageModelUsage,
    });

    expect(markup).toContain("Cache");
    expect(markup).toContain("128");
  });

  it("does not read removed flat AI SDK v6 token detail fields", () => {
    const legacyUsage = {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      cachedInputTokens: 128,
      reasoningTokens: 42,
    } as unknown as LanguageModelUsage;

    expect(
      renderUsageMarkup({
        children: <ContextReasoningUsage />,
        usage: legacyUsage,
      }),
    ).not.toContain("Reasoning");
    expect(
      renderUsageMarkup({
        children: <ContextCacheUsage />,
        usage: legacyUsage,
      }),
    ).not.toContain("Cache");
  });
});
