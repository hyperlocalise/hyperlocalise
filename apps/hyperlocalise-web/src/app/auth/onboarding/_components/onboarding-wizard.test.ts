import { describe, expect, it } from "vite-plus/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingWizard } from "./onboarding-wizard";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("OnboardingWizard Accessibility", () => {
  it("renders Workspace name field with label", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TooltipProvider, {}, React.createElement(OnboardingWizard)),
    );

    expect(markup).toContain("Hyperlocalise logo");
    expect(markup).toContain("Create your workspace");
    expect(markup).toContain("Your workspace holds projects");
    expect(markup).toContain("Workspace name");
    expect(markup).toContain("/org/workspace");
    expect(markup).toContain('for="_R_');
    expect(markup).toContain('id="_R_');
  });
});
