/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { ProjectTargetLocalesPicker } from "./project-locale-picker";

function renderTargetLocalesPicker(
  props: Partial<Parameters<typeof ProjectTargetLocalesPicker>[0]> = {},
) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <ProjectTargetLocalesPicker
        value={["fr-FR", "zu-ZA"]}
        sourceLocale="en-US"
        onChange={vi.fn()}
        {...props}
      />
    </IntlProvider>,
  );
}

describe("ProjectTargetLocalesPicker", () => {
  it("shows target locale display names while keeping locale codes in button labels", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderTargetLocalesPicker({ onChange });

    expect(screen.getByText("French (France)")).toBeInTheDocument();
    expect(screen.getByText("Zulu (South Africa)")).toBeInTheDocument();
    expect(screen.queryByText("fr-FR")).not.toBeInTheDocument();
    expect(screen.queryByText("zu-ZA")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "French (France) (fr-FR)" }));

    expect(onChange).toHaveBeenCalledWith(["zu-ZA"]);
  });
});
