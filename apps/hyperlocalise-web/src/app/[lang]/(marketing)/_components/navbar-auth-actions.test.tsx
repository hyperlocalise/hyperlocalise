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
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { IntlProvider } from "react-intl";

import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";

const { trackMarketingCtaClickMock } = vi.hoisted(() => ({
  trackMarketingCtaClickMock: vi.fn(),
}));

vi.mock("@/lib/analytics/marketing-cta", () => ({
  trackMarketingCtaClick: trackMarketingCtaClickMock,
}));

import { NavbarDesktopAuthActions } from "./navbar-auth-actions";

function renderActions(isAuthenticated: boolean) {
  return render(
    <IntlProvider locale="de-DE" messages={{}} onError={() => undefined}>
      <NavbarDesktopAuthActions auth={{ loading: false, isAuthenticated }} locale="de-DE" />
    </IntlProvider>,
  );
}

describe("NavbarDesktopAuthActions", () => {
  it("links authenticated visitors directly to the localized dashboard", () => {
    renderActions(true);

    expect(screen.getByRole("button", { name: "Dashboard" }).getAttribute("href")).toBe(
      "/de-DE/dashboard",
    );
  });

  it("keeps the sign-in route outside the locale prefix", () => {
    renderActions(false);

    expect(screen.getByRole("button", { name: "Sign in" }).getAttribute("href")).toBe(
      "/auth/sign-in",
    );
  });

  it("tracks marketing CTA clicks for sign-in and request demo", async () => {
    const user = userEvent.setup();
    renderActions(false);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(screen.getByRole("button", { name: "Request a Demo" }));

    expect(trackMarketingCtaClickMock).toHaveBeenCalledWith("sign_in", "navbar");
    expect(trackMarketingCtaClickMock).toHaveBeenCalledWith("request_demo", "navbar");
    expect(PRODUCT_USAGE_ANALYTICS_EVENTS.marketingCtaClick).toBe("marketing_cta_click");
  });
});
