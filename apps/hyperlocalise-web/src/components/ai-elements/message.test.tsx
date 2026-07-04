import { describe, expect, it } from "vite-plus/test";
import React from "react";
import { IntlProvider } from "react-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBranch, MessageBranchPrevious, MessageBranchNext } from "./message";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("MessageBranch Navigation Tooltips", () => {
  it("MessageBranchPrevious renders with tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <IntlProvider locale="en" messages={{}}>
        <TooltipProvider>
          <MessageBranch>
            <MessageBranchPrevious />
          </MessageBranch>
        </TooltipProvider>
      </IntlProvider>,
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Previous branch"');

    // Ensure no nested buttons
    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });

  it("MessageBranchNext renders with tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <IntlProvider locale="en" messages={{}}>
        <TooltipProvider>
          <MessageBranch>
            <MessageBranchNext />
          </MessageBranch>
        </TooltipProvider>
      </IntlProvider>,
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Next branch"');

    // Ensure no nested buttons
    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });
});
