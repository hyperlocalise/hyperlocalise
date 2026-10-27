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
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import LocalisationAuditResultError from "./error";

const navigationMock = vi.hoisted(() => ({
  params: { lang: "fr-FR", domainSlug: "acme-example" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => navigationMock.params,
}));

afterEach(() => {
  navigationMock.params = { lang: "fr-FR", domainSlug: "acme-example" };
  vi.restoreAllMocks();
});

function renderRouteError() {
  const unstableRetry = vi.fn();
  const error = new Error("audit detail failed");

  render(
    <IntlProvider locale="en" messages={{}}>
      <LocalisationAuditResultError error={error} unstable_retry={unstableRetry} />
    </IntlProvider>,
  );

  return { error, unstableRetry };
}

describe("LocalisationAuditResultError", () => {
  it("keeps the marketing recovery compact and retries the audit route", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { error, unstableRetry } = renderRouteError();

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(error);
    });
    expect(screen.getByRole("button", { name: "Back to localisation audit" })).toHaveAttribute(
      "href",
      "/fr-FR/localisation-audit",
    );
    expect(screen.getByRole("main").className).not.toContain("min-h-dvh");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(unstableRetry).toHaveBeenCalledOnce();
  });
});
