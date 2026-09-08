// @vitest-environment happy-dom

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
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import {
  AUTOMATION_HOW_IT_WORKS_INTEGRATION_SLUGS,
  AutomationHowItWorksIntegrations,
} from "./automation-how-it-works-integrations";

describe("AutomationHowItWorksIntegrations", () => {
  it("shows the connected tools and links marketing integrations", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <AutomationHowItWorksIntegrations />
      </IntlProvider>,
    );

    expect(screen.getByRole("list", { name: "Tools you can connect" })).toBeInTheDocument();
    expect(AUTOMATION_HOW_IT_WORKS_INTEGRATION_SLUGS).toContain("contentful");
    expect(AUTOMATION_HOW_IT_WORKS_INTEGRATION_SLUGS).toContain("webflow");
    expect(screen.getByRole("link", { name: "Slack" })).toHaveAttribute(
      "href",
      "/en/integrations/slack",
    );
    expect(screen.getByRole("link", { name: "Contentful" })).toHaveAttribute(
      "href",
      "/en/integrations/contentful",
    );
    expect(screen.queryByRole("link", { name: "Webflow" })).not.toBeInTheDocument();
  });
});
