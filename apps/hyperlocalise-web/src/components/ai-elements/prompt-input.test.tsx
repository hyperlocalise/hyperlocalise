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
import { describe, expect, it } from "vite-plus/test";
import React from "react";
import { IntlProvider } from "react-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptInputButton, PromptInputSubmit, PromptInput } from "./prompt-input";
import { TooltipProvider } from "@/components/ui/tooltip";

const withTestProviders = (children: React.ReactNode) =>
  React.createElement(IntlProvider, { locale: "en", messages: {} }, children);

describe("PromptInput Components Tooltip & Accessibility", () => {
  it("PromptInputButton renders with tooltip trigger and no nested buttons", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        {},
        React.createElement(
          PromptInputButton,
          {
            tooltip: { content: "Test Tooltip", shortcut: "Cmd+K" },
          },
          "Click me",
        ),
      ),
    );

    expect(markup).toContain("Click me");
    expect(markup).toContain('data-slot="tooltip-trigger"');

    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });

  it("PromptInputSubmit renders with tooltip trigger and no nested buttons", () => {
    const markup = renderToStaticMarkup(
      withTestProviders(
        React.createElement(
          TooltipProvider,
          {},
          React.createElement(
            PromptInput,
            { onSubmit: () => {} },
            React.createElement(
              PromptInputSubmit,
              {
                tooltip: { content: "Send", shortcut: "Enter" },
              },
              "Send",
            ),
          ),
        ),
      ),
    );

    expect(markup).toContain("Send");
    expect(markup).toContain('data-slot="tooltip-trigger"');

    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });
});
