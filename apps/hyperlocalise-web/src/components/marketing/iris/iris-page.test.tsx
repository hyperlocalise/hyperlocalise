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

import { IrisPage } from "./iris-page";
import { IRIS_WAITLIST_URL } from "@/lib/iris/iris-waitlist";

describe("IrisPage", () => {
  it("renders the waitlist headline and Tally call to action", () => {
    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <IrisPage />
      </IntlProvider>,
    );

    expect(screen.getByText("Early access from Hyperlocalise")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /Create and localise\s+images and video/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Iris is Hyperlocalise's creative engine. It learns your brand, then creates and localises images, video, motion, and audio so every market gets an on-brand campaign.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Join the waitlist for early access. We'll email you when Iris is ready."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute(
      "href",
      IRIS_WAITLIST_URL,
    );
    expect(screen.getByRole("link", { name: "Back to Hyperlocalise" })).toHaveAttribute(
      "href",
      "/en",
    );
  });
});
