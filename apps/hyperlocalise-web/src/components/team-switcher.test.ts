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
import { describe, expect, it } from "vite-plus/test";

import { buildOrganizationSwitchReturnTo } from "./team-switcher";

describe("buildOrganizationSwitchReturnTo", () => {
  it("rewrites the active organization segment in org-scoped paths", () => {
    expect(buildOrganizationSwitchReturnTo("/org/acme/projects/123", "acme", "beta")).toBe(
      "/org/beta/projects/123",
    );
  });

  it("falls back to the target dashboard for non-org paths", () => {
    expect(buildOrganizationSwitchReturnTo("/auth/onboarding", "acme", "beta")).toBe(
      "/org/beta/dashboard",
    );
  });
});
