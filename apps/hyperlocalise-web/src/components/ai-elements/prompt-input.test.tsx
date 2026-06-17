import { describe, expect, it } from "vitest";
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
