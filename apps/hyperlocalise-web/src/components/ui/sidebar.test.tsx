import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarTrigger, SidebarProvider } from "./sidebar";
import { TooltipProvider } from "./tooltip";

describe("SidebarTrigger Accessibility", () => {
  it("SidebarTrigger renders with icons inside the button", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        {},
        React.createElement(TooltipProvider, {}, React.createElement(SidebarTrigger, {})),
      ),
    );

    // Check that the button is present
    expect(markup).toContain("<button");
    // Check that the icon and sr-only text are present
    expect(markup).toMatch(/Collapse Sidebar|Expand Sidebar/);

    // The key part: verify no nested buttons and that the content is inside the button
    const buttonCount = (markup.match(/<button/g) || []).length;
    expect(buttonCount).toBe(1);

    // Verify the icon is inside the button
    // A simple way is to check that the button tag is NOT self-closing before the icon
    const buttonOpenIndex = markup.indexOf("<button");
    const iconIndex = markup.indexOf("<svg");
    const buttonCloseIndex = markup.indexOf("</button>");

    expect(buttonOpenIndex).toBeLessThan(iconIndex);
    expect(iconIndex).toBeLessThan(buttonCloseIndex);
  });
});
