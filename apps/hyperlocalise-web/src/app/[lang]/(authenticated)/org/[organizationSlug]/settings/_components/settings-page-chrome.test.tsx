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

import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { SettingsLayoutFrame } from "./settings-page-chrome";

describe("SettingsLayoutFrame", () => {
  it("keeps a flexing content scroll region when the panes stack below md", () => {
    const { container } = render(
      <SettingsLayoutFrame nav={<nav>Settings</nav>}>
        <p>Billing</p>
      </SettingsLayoutFrame>,
    );

    const frame = container.firstElementChild;
    expect(frame).toHaveClass("flex-1", "min-h-0", "flex-col", "overflow-hidden", "md:flex-row");

    const contentPane = frame?.lastElementChild;
    expect(contentPane).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
  });
});
