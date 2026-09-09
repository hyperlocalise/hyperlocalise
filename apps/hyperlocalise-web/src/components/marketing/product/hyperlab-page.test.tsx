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

import { HyperlabPage } from "./hyperlab-page";

describe("HyperlabPage", () => {
  it("lets visitors pick a winning headline", async () => {
    const user = userEvent.setup();

    render(
      <IntlProvider locale="en" messages={{}}>
        <HyperlabPage />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: /Try it in one market/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Japan.*Start free/i }));

    expect(screen.getByText("This version is winning")).toBeInTheDocument();
  });
});
