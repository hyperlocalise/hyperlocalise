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
import type { ResolvedIdentity } from "autumn-js/backend";

import type { ApiAuthContext } from "@/api/auth/workos";
import { ok, type Result } from "@/lib/primitives/result/results";

/**
 * Customer identity mapping for Autumn:
 *
 * - `customerId` = `organizations.id` (internal UUID) for stable org-scoped billing
 * - `customerData.name` = organization display name
 * - `customerData.email` = acting authenticated user email (billing contact hint)
 */
export type ResolveAutumnCustomerIdentityError = {
  code: "billing_customer_unavailable";
};

export function resolveAutumnCustomerIdentity(
  auth: ApiAuthContext,
): Result<ResolvedIdentity, ResolveAutumnCustomerIdentityError> {
  return ok({
    customerId: auth.organization.localOrganizationId,
    customerData: {
      name: auth.organization.name,
      email: auth.user.email,
    },
  });
}
