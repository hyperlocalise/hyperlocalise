import type { ResolvedIdentity } from "autumn-js/backend";

import type { ApiAuthContext } from "@/api/auth/workos";
import { err, ok, type Result } from "@/lib/primitives/result/results";

/** Synthetic WorkOS organization IDs for deprecated local-only workspaces. */
export const LOCAL_ORG_WORKOS_ID_PREFIX = "local_org_";

/**
 * Customer identity mapping for Autumn:
 *
 * - `customerId` = `organizations.id` (internal UUID) for stable org-scoped billing
 * - `customerData.name` = organization display name
 * - `customerData.email` = acting authenticated user email (billing contact hint)
 *
 * Deprecated `local_org_*` workspaces are excluded and never become Autumn customers.
 */
export function isDeprecatedLocalOrgWorkosId(workosOrganizationId: string) {
  return workosOrganizationId.startsWith(LOCAL_ORG_WORKOS_ID_PREFIX);
}

export type ResolveAutumnCustomerIdentityError = {
  code: "billing_customer_unavailable";
};

export function resolveAutumnCustomerIdentity(
  auth: ApiAuthContext,
): Result<ResolvedIdentity, ResolveAutumnCustomerIdentityError> {
  if (isDeprecatedLocalOrgWorkosId(auth.organization.workosOrganizationId)) {
    return err({ code: "billing_customer_unavailable" });
  }

  return ok({
    customerId: auth.organization.localOrganizationId,
    customerData: {
      name: auth.organization.name,
      email: auth.user.email,
    },
  });
}
