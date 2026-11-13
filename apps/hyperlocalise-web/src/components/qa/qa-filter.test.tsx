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
import { describe, expect, it, vi } from "vite-plus/test";

import { QaFilter } from "./qa-filter";

describe("QaFilter", () => {
  it("shows the selected option label instead of the raw value", () => {
    render(
      <QaFilter
        label="Review status"
        value="open"
        onChange={vi.fn()}
        options={[
          { value: "all", label: "All" },
          { value: "open", label: "Open" },
        ]}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Review status" });
    expect(trigger).toHaveTextContent("Open");
    expect(trigger.textContent).not.toBe("open");
  });
});
