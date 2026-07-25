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

import { SITE_URL } from "@/lib/seo/site-url";

import {
  buildLocalisationAuditVerifyUrl,
  hashLocalisationAuditReportToken,
  localisationAuditUnlockCookieName,
  mintLocalisationAuditReportToken,
  signLocalisationAuditUnlock,
  verifyLocalisationAuditUnlock,
} from "./email-unlock";

describe("localisation audit unlock cookies", () => {
  it("uses a separate cookie name per domain", () => {
    expect(localisationAuditUnlockCookieName("stripe-com")).toBe("hl_la_unlock_stripe-com");
    expect(localisationAuditUnlockCookieName("acme-com")).not.toBe(
      localisationAuditUnlockCookieName("stripe-com"),
    );
  });

  it("signs and verifies unlock tokens only for the matching domain", () => {
    const token = signLocalisationAuditUnlock({
      domainSlug: "example-com",
      email: "lead@example.com",
    });
    expect(verifyLocalisationAuditUnlock(token, "example-com")).toEqual({
      email: "lead@example.com",
    });
    expect(verifyLocalisationAuditUnlock(token, "other-com")).toBeNull();
  });
});

describe("localisation audit report tokens", () => {
  it("mints opaque tokens with hashed storage form and expiry", () => {
    const minted = mintLocalisationAuditReportToken();
    expect(minted.token.length).toBeGreaterThan(20);
    expect(minted.tokenHash).toBe(hashLocalisationAuditReportToken(minted.token));
    expect(minted.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("builds verify URLs from a deploy-safe public origin", () => {
    const url = buildLocalisationAuditVerifyUrl({
      domainSlug: "example-com-abcdef",
      token: "opaque-token",
      locale: "en",
    });
    expect(url).not.toContain("localhost");
    expect(url.startsWith(SITE_URL) || url.includes("example.test")).toBe(true);
    expect(url).toContain("/api/localisation-audit/example-com-abcdef/verify");
    expect(url).toContain("token=opaque-token");
  });
});
