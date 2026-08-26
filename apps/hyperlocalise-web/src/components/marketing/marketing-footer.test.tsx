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

import { MarketingFooter } from "./marketing-footer";

describe("MarketingFooter", () => {
  it("prefixes internal links with the active locale", () => {
    render(
      <IntlProvider locale="fr-FR" messages={{}} onError={() => undefined}>
        <MarketingFooter
          columns={[
            {
              title: "Links",
              links: [
                { label: "Pricing", href: "/pricing" },
                { label: "Documentation", href: "https://hyperlocalise.dev" },
                { label: "Contact", href: "mailto:minh@hyperlocalise.com" },
              ],
            },
          ]}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("link", { name: "Pricing" }).getAttribute("href")).toBe(
      "/fr-FR/pricing",
    );
    expect(screen.getByRole("link", { name: "Documentation" }).getAttribute("href")).toBe(
      "https://hyperlocalise.dev",
    );
    expect(screen.getByRole("link", { name: "Contact" }).getAttribute("href")).toBe(
      "mailto:minh@hyperlocalise.com",
    );
  });
});
