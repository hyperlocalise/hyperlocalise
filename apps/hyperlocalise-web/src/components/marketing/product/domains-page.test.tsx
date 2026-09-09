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
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { DomainsPage } from "./domains-page";

describe("DomainsPage", () => {
  it("highlights the matching live-page issue when an audit finding is selected", async () => {
    const user = userEvent.setup();

    render(
      <IntlProvider locale="en" messages={{}}>
        <DomainsPage />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: /Publish once/i })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /German page has no search description/i }),
    );

    expect(
      screen.getByText("Search has no description to show under this title."),
    ).toBeInTheDocument();
  });
});
