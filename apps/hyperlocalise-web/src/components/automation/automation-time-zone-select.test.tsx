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
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { AutomationTimeZoneSelect } from "./automation-time-zone-select";

function renderSelect(onValueChange = vi.fn()) {
  return {
    onValueChange,
    ...render(
      <IntlProvider locale="en" messages={{}}>
        <AutomationTimeZoneSelect
          value="UTC"
          onValueChange={onValueChange}
          aria-label="Schedule timezone"
        />
      </IntlProvider>,
    ),
  };
}

describe("AutomationTimeZoneSelect", () => {
  it("filters timezones from the search input and selects a match", async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderSelect();

    await user.click(screen.getByRole("button", { name: "Schedule timezone" }));

    const search = screen.getByRole("combobox", { name: "Search timezones…" });
    await user.type(search, "sydney");

    expect(screen.getByRole("option", { name: "Australia/Sydney" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "America/New York" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Australia/Sydney" }));
    expect(onValueChange).toHaveBeenCalledWith("Australia/Sydney");
  });
});
