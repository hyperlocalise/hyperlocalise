/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import LocaleError from "./error";

const navigationMock = vi.hoisted(() => ({
  params: { lang: "fr-FR" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => navigationMock.params,
}));

afterEach(() => {
  navigationMock.params = { lang: "fr-FR" };
  vi.restoreAllMocks();
});

function renderLocaleError() {
  const unstableRetry = vi.fn();
  const error = new Error("route failed");

  render(
    <IntlProvider locale="en" messages={{}}>
      <LocaleError error={error} unstable_retry={unstableRetry} />
    </IntlProvider>,
  );

  return { error, unstableRetry };
}

describe("LocaleError", () => {
  it("links users back to the localized dashboard and retries the route segment", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { error, unstableRetry } = renderLocaleError();

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(error);
    });
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/fr-FR/dashboard",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(unstableRetry).toHaveBeenCalledOnce();
  });
});
