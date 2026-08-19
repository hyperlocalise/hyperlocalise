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
import { describe, expect, it } from "vite-plus/test";

import { NotFoundRecovery } from "@/components/not-found/not-found-recovery";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

describe("NotFoundRecovery", () => {
  it("offers homepage, dashboard, and support actions", () => {
    render(
      <NotFoundRecovery
        statusCode="404"
        title="Page not found"
        description="This address does not match a page."
        homeLabel="Back to homepage"
        dashboardLabel="Go to dashboard"
        supportLabel="Contact support"
        homeHref="/"
        dashboardHref="/dashboard"
      />,
    );

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to homepage" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("button", { name: "Contact support" })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`,
    );
  });
});
