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
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { developerResourcesDocUrls } from "./overview-developer-resource-urls";
import { OverviewDeveloperResources } from "./overview-developer-resources";

function renderSection() {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <OverviewDeveloperResources />
    </IntlProvider>,
  );
}

describe("OverviewDeveloperResources", () => {
  it("renders the section title and documentation links", () => {
    renderSection();

    expect(screen.getByRole("heading", { name: "Developer resources" })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Documentation/ })).toHaveAttribute(
      "href",
      developerResourcesDocUrls.gettingStarted,
    );
    expect(screen.getByRole("link", { name: /MCP server/ })).toHaveAttribute(
      "href",
      developerResourcesDocUrls.mcp,
    );
    expect(screen.getByRole("link", { name: /Public API/ })).toHaveAttribute(
      "href",
      developerResourcesDocUrls.api,
    );
    expect(screen.getByRole("link", { name: /Integrations/ })).toHaveAttribute(
      "href",
      developerResourcesDocUrls.integrations,
    );
  });

  it("opens documentation links in a new tab", () => {
    renderSection();

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
