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

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { ErrorRecovery } from "@/components/error-recovery/error-recovery";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

describe("ErrorRecovery", () => {
  it("offers retry, dashboard, and support actions", () => {
    const retry = vi.fn();

    render(
      <ErrorRecovery
        title="We couldn't load this page"
        description="Try loading the page again."
        tryAgainLabel="Try again"
        dashboardLabel="Go to dashboard"
        supportLabel="Contact support"
        dashboardHref="/fr-FR/org/acme/dashboard"
        retry={retry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/fr-FR/org/acme/dashboard",
    );
    expect(screen.getByRole("button", { name: "Contact support" })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_EMAIL}`,
    );
  });
});
