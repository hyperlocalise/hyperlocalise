/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it, vi } from "vite-plus/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntlProvider } from "react-intl";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getIntlShape } from "@/lib/app-i18n/intl";

vi.mock("../actions", () => ({
  createWorkspaceAction: async () => ({}),
}));

import { OnboardingWizard } from "./onboarding-wizard";

const testIntl = getIntlShape("en");

describe("OnboardingWizard Accessibility", () => {
  it("renders Workspace name field with label", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        IntlProvider,
        { locale: "en", messages: testIntl.messages },
        React.createElement(TooltipProvider, {}, React.createElement(OnboardingWizard)),
      ),
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
