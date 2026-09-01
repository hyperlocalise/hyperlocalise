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
import { describe, expect, it } from "vite-plus/test";
import { IntlProvider } from "react-intl";

import { UpgradePlanButton } from "./upgrade-plan-button";

describe("UpgradePlanButton", () => {
  it("links to the workspace available plans section", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <UpgradePlanButton organizationSlug="acme" />
      </IntlProvider>,
    );

    expect(screen.getByRole("link", { name: "Upgrade plan" })).toHaveAttribute(
      "href",
      "/org/acme/settings/billing#available-plans",
    );
  });
});
