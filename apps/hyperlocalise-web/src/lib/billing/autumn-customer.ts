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
