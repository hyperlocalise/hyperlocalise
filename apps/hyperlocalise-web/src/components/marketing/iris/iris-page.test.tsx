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

describe("IrisPage", () => {
  it("renders the Mac download control and a sound toggle once the film can play", async () => {
    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <IrisPage faqItems={[{ question: "Is Iris free?", answer: "Free to download." }]} />
      </IntlProvider>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Iris, the AI localisation engine for multilingual assets",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join the waitlist" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Download for Mac" })[0]).toHaveAttribute(
      "href",
      irisMacDownloadUrl("arm64"),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "More Mac downloads" })[0]!);
    expect(await screen.findByRole("menuitem", { name: "Apple Silicon Mac" })).toHaveAttribute(
      "href",
      irisMacDownloadUrl("arm64"),
    );
    expect(screen.getByRole("menuitem", { name: "Intel Mac" })).toHaveAttribute(
      "href",
      irisMacDownloadUrl("x64"),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Make every asset feel local." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Is Iris free?")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /See pricing|See plans and model rates/ }).length,
    ).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unmute the launch film" })).toBeInTheDocument();
    });
  });
});
