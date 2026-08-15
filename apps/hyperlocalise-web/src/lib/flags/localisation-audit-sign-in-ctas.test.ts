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

import {
  isLocalisationAuditSignInCtaEnabled,
  LOCALISATION_AUDIT_SIGN_IN_CTAS_FLAG,
} from "./localisation-audit-sign-in-ctas";

describe("isLocalisationAuditSignInCtaEnabled", () => {
  it("hides CTAs while auth is loading", () => {
    expect(
      isLocalisationAuditSignInCtaEnabled({
        loading: true,
        user: { id: "user_1" },
        featureFlags: [LOCALISATION_AUDIT_SIGN_IN_CTAS_FLAG],
      }),
    ).toBe(false);
  });

  it("hides CTAs for guests", () => {
    expect(
      isLocalisationAuditSignInCtaEnabled({
        loading: false,
        user: null,
        featureFlags: [LOCALISATION_AUDIT_SIGN_IN_CTAS_FLAG],
      }),
    ).toBe(false);
  });

  it("hides CTAs when the flag is missing from the session", () => {
    expect(
      isLocalisationAuditSignInCtaEnabled({
        loading: false,
        user: { id: "user_1" },
        featureFlags: ["other-flag"],
      }),
    ).toBe(false);
  });

  it("shows CTAs for signed-in users with the flag", () => {
    expect(
      isLocalisationAuditSignInCtaEnabled({
        loading: false,
        user: { id: "user_1" },
        featureFlags: [LOCALISATION_AUDIT_SIGN_IN_CTAS_FLAG],
      }),
    ).toBe(true);
  });
});
