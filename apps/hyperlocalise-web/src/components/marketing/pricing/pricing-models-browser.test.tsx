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

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { PricingModelsBrowser } from "./pricing-models-browser";
import { getPricingModelsSectionContent } from "./pricing-page-content";

function renderBrowser() {
  const { heading: _heading, subcopy: _subcopy, ...browser } = getPricingModelsSectionContent("en");
  render(
    <IntlProvider locale="en" messages={{}}>
      <PricingModelsBrowser {...browser} />
    </IntlProvider>,
  );
  return browser;
}

describe("PricingModelsBrowser", () => {
  it("opens on a short recommended list and explains the selected model", () => {
    renderBrowser();

    expect(screen.getByRole("button", { name: /^GPT-6 Luna Workspace default/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(/one default the whole workspace can share/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /GPT-5.4 Nano/ })).not.toBeInTheDocument();
    expect(screen.getByText("10 models")).toBeVisible();
  });

  it("filters by job, switches the explanation, and can search the full catalog", async () => {
    const user = userEvent.setup();
    renderBrowser();

    const jobs = screen.getByRole("group", { name: "Filter by job" });
    await user.click(within(jobs).getByRole("button", { name: "Voice" }));

    expect(screen.getByRole("button", { name: /Fish Audio/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /GPT-6 Luna/ })).not.toBeInTheDocument();
    expect(screen.getByText(/rhythm and length of a line/i)).toBeVisible();

    await user.click(within(jobs).getByRole("button", { name: "All" }));
    await user.click(screen.getByRole("button", { name: /Claude Sonnet 5/ }));

    expect(screen.getByText(/second writer for longer text/i)).toBeVisible();
    expect(
      screen.queryByText(/one default the whole workspace can share/i),
    ).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search models" }), "nano");

    expect(screen.getByText("Nothing recommended matches")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show every model" }));

    expect(screen.getByRole("button", { name: /GPT-5.4 Nano/ })).toBeVisible();
    expect(screen.getByText("1 model")).toBeVisible();
  });
});
