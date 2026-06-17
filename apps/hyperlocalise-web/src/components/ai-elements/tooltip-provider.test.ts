import { describe, expect, it } from "vite-plus/test";
import React from "react";
import { IntlProvider } from "react-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageAction } from "./message";
import { ArtifactAction } from "./artifact";
import { WebPreviewNavigationButton } from "./web-preview";
import { CodeBlockCopyButton } from "./code-block";
import { TooltipProvider } from "@/components/ui/tooltip";

const withTestProviders = (children: React.ReactNode) =>
  React.createElement(IntlProvider, { locale: "en", messages: {} }, children);

describe("Tooltip Redundancy Optimization", () => {
  it("MessageAction renders correctly within a TooltipProvider", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        {},
        React.createElement(
          MessageAction,
          { tooltip: "Test Tooltip", label: "Test Label" },
          "Click me",
        ),
      ),
    );
    // Should contain the button text and the sr-only label
    expect(markup).toContain("Click me");
    expect(markup).toContain("Test Label");
    // Since it's a Tooltip, it should have the data-slot="tooltip-trigger" from our TooltipTrigger
    expect(markup).toContain('data-slot="tooltip-trigger"');
  });

  it("ArtifactAction renders correctly within a TooltipProvider", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        {},
        React.createElement(
          ArtifactAction,
          { tooltip: "Artifact Tooltip", label: "Artifact Label" },
          "Artifact",
        ),
      ),
    );
    expect(markup).toContain("Artifact");
    expect(markup).toContain("Artifact Label");
    expect(markup).toContain('data-slot="tooltip-trigger"');
  });

  it("WebPreviewNavigationButton renders correctly within a TooltipProvider", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        {},
        React.createElement(WebPreviewNavigationButton, { tooltip: "Web Tooltip" }, "Web"),
      ),
    );
    expect(markup).toContain("Web");
    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Web Tooltip"');
  });

  it("CodeBlockCopyButton renders correctly within a TooltipProvider", () => {
    const markup = renderToStaticMarkup(
      withTestProviders(
        React.createElement(
          TooltipProvider,
          {},
          React.createElement(CodeBlockCopyButton, {}, "Copy"),
        ),
      ),
    );
    expect(markup).toContain("Copy");
    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('aria-label="Copy code"');
  });
});
