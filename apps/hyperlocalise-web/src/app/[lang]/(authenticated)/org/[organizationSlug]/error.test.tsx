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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import OrganizationError from "./error";

const navigationMock = vi.hoisted(() => ({
  params: { lang: "ja-JP", organizationSlug: "acme-team" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => navigationMock.params,
}));

afterEach(() => {
  navigationMock.params = { lang: "ja-JP", organizationSlug: "acme-team" };
  vi.restoreAllMocks();
});

function renderOrganizationError() {
  const unstableRetry = vi.fn();
  const error = new Error("organization route failed");

  render(
    <IntlProvider locale="en" messages={{}}>
      <OrganizationError error={error} unstable_retry={unstableRetry} />
    </IntlProvider>,
  );

  return { error, unstableRetry };
}

describe("OrganizationError", () => {
  it("links users back to their organization dashboard and retries the route segment", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { error, unstableRetry } = renderOrganizationError();

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(error);
    });
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/ja-JP/org/acme-team/dashboard",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(unstableRetry).toHaveBeenCalledOnce();
  });
});
