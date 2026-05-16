import { describe, expect, it } from "vite-plus/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingWizard } from "./onboarding-wizard";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("OnboardingWizard Accessibility", () => {
  it("renders API key field with label and password type", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        {},
        React.createElement(OnboardingWizard, {
          step: "provider",
          providerSetupStatus: "pending"
        })
      )
    );

    // Check for API key label
    expect(markup).toContain("API key");
    // Check for password type
    expect(markup).toContain('type="password"');
    // Check for the eye icon button
    expect(markup).toContain('aria-label="Show API key"');
    // Check for htmlFor association
    expect(markup).toContain('for="_R_');
    expect(markup).toContain('id="_R_');
  });

  it("renders Workspace name field with label in create step", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        {},
        React.createElement(OnboardingWizard, {
          step: "create"
        })
      )
    );

    expect(markup).toContain("Workspace name");
    expect(markup).toContain('for="_R_');
    expect(markup).toContain('id="_R_');
  });
});
