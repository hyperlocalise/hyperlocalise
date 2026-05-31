import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBranch, MessageBranchPrevious, MessageBranchNext } from "./message";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("MessageBranch Navigation Tooltips", () => {
  it("MessageBranchPrevious renders with tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <MessageBranch>
          <MessageBranchPrevious />
        </MessageBranch>
      </TooltipProvider>
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Previous branch"');

    // Ensure no nested buttons
    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });

  it("MessageBranchNext renders with tooltip trigger", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <MessageBranch>
          <MessageBranchNext />
        </MessageBranch>
      </TooltipProvider>
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Next branch"');

    // Ensure no nested buttons
    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);
  });
});
