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

import { getPricingPlans } from "./pricing-page-content";
import { PricingPlansSection } from "./pricing-plans-section";

describe("PricingPlansSection", () => {
  it("uses h3 card headings and does not render plan prices as h2", () => {
    const plans = getPricingPlans("en");
    const { container } = render(
      <IntlProvider locale="en">
        <PricingPlansSection plans={plans} popularBadge="Popular" />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Starter: $20 per month" })).toBeTruthy();
    expect(container.querySelectorAll("article h2")).toHaveLength(0);
    expect(container.querySelectorAll("article h3")).toHaveLength(plans.length);
  });
});
