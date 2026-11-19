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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { IrisPage } from "./iris-page";
import { irisMacDownloadUrl } from "@/lib/iris/iris-download";
import { IRIS_WAITLIST_URL } from "@/lib/iris/iris-waitlist";

describe("IrisPage", () => {
  it("renders the waitlist control and a sound toggle once the film can play", async () => {
    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <IrisPage />
      </IntlProvider>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Iris, the AI localisation engine for multilingual assets",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join the waitlist" })).toHaveAttribute(
      "href",
      IRIS_WAITLIST_URL,
    );
    expect(screen.getByRole("button", { name: "Download for Mac" })).toHaveAttribute(
      "href",
      irisMacDownloadUrl("arm64"),
    );

    fireEvent.click(screen.getByRole("button", { name: "More Mac downloads" }));
    expect(await screen.findByRole("menuitem", { name: "Apple Silicon Mac" })).toHaveAttribute(
      "href",
      irisMacDownloadUrl("arm64"),
    );
    expect(screen.getByRole("menuitem", { name: "Intel Mac" })).toHaveAttribute(
      "href",
      irisMacDownloadUrl("x64"),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unmute the launch film" })).toBeInTheDocument();
    });
  });
});
