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

import { render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { IrisPage } from "./iris-page";
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unmute the launch film" })).toBeInTheDocument();
    });
  });
});
