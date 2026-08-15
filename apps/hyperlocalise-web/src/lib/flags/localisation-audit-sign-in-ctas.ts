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

/** WorkOS feature flag: show localisation-audit sign-in / claim CTAs. */
export const LOCALISATION_AUDIT_SIGN_IN_CTAS_FLAG = "localisation-audit-sign-in-ctas";

export function isLocalisationAuditSignInCtaEnabled(input: {
  loading: boolean;
  user: { id: string } | null | undefined;
  featureFlags: string[] | null | undefined;
}): boolean {
  if (input.loading || !input.user) {
    return false;
  }
  return (input.featureFlags ?? []).includes(LOCALISATION_AUDIT_SIGN_IN_CTAS_FLAG);
}
