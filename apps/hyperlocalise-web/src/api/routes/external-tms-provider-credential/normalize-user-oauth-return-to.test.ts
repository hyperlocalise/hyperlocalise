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

import { normalizeUserOAuthReturnTo } from "./normalize-user-oauth-return-to";

describe("normalizeUserOAuthReturnTo", () => {
  const organizationSlug = "acme";

  it("returns dashboard fallback when returnTo is empty", () => {
    expect(normalizeUserOAuthReturnTo(undefined, organizationSlug)).toBe("/org/acme/dashboard");
    expect(normalizeUserOAuthReturnTo(null, organizationSlug)).toBe("/org/acme/dashboard");
    expect(normalizeUserOAuthReturnTo("   ", organizationSlug)).toBe("/org/acme/dashboard");
  });

  it("accepts org-scoped paths without a locale prefix", () => {
    expect(normalizeUserOAuthReturnTo("/org/acme/integrations", organizationSlug)).toBe(
      "/org/acme/integrations",
    );
    expect(normalizeUserOAuthReturnTo("/org/acme/integrations?tab=tms", organizationSlug)).toBe(
      "/org/acme/integrations?tab=tms",
    );
  });

  it("accepts locale-prefixed org-scoped paths", () => {
    expect(normalizeUserOAuthReturnTo("/en/org/acme/integrations", organizationSlug)).toBe(
      "/en/org/acme/integrations",
    );
    expect(normalizeUserOAuthReturnTo("/en/org/acme/integrations?tab=tms", organizationSlug)).toBe(
      "/en/org/acme/integrations?tab=tms",
    );
  });

  it("redirects bare org root paths to dashboard", () => {
    expect(normalizeUserOAuthReturnTo("/org/acme", organizationSlug)).toBe("/org/acme/dashboard");
    expect(normalizeUserOAuthReturnTo("/en/org/acme", organizationSlug)).toBe(
      "/org/acme/dashboard",
    );
  });

  it("returns dashboard fallback for invalid paths", () => {
    expect(normalizeUserOAuthReturnTo("/dashboard", organizationSlug)).toBe("/org/acme/dashboard");
    expect(normalizeUserOAuthReturnTo("/org/other-org/integrations", organizationSlug)).toBe(
      "/org/acme/dashboard",
    );
    expect(normalizeUserOAuthReturnTo("not-a-valid-url%%%", organizationSlug)).toBe(
      "/org/acme/dashboard",
    );
  });
});
