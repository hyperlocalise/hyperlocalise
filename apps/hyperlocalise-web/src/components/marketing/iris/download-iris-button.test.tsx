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

import { DownloadIrisButton, isMacDesktop } from "./download-iris-button";

describe("isMacDesktop", () => {
  it("accepts desktop Macs and rejects iPads, phones and Windows", () => {
    const macUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

    expect(isMacDesktop(macUserAgent, 0)).toBe(true);
    expect(isMacDesktop(macUserAgent, 5)).toBe(false);
    expect(isMacDesktop("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(false);
    expect(isMacDesktop("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0)).toBe(false);
  });
});

describe("DownloadIrisButton", () => {
  it("shows the Free badge and links somewhere useful", () => {
    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <DownloadIrisButton source="test" />
      </IntlProvider>,
    );

    const button = screen.getByRole("button", { name: /Download Iris/ });
    expect(button).toHaveTextContent("Free");
    expect(button.getAttribute("href")).toMatch(/\/iris$|\.dmg$/);
  });
});
