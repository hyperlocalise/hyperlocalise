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

import { ContactPage } from "./contact-page";
import { supportEmailMailto } from "./contact-page-content";

describe("ContactPage", () => {
  it("renders the heading, subheading, and support email button", () => {
    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <ContactPage locale="en" />
      </IntlProvider>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Talk with the Hyperlocalise team" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Questions about localisation, pricing, or your account? Email us and we will reply within one business day.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email support" })).toHaveAttribute(
      "href",
      supportEmailMailto,
    );
  });
});
