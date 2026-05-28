import type { ResolvedIdentity } from "autumn-js/backend";

import type { ApiAuthContext } from "@/api/auth/workos";

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

export function resolveAutumnCustomerIdentity(auth: ApiAuthContext): ResolvedIdentity | null {
  if (isDeprecatedLocalOrgWorkosId(auth.organization.workosOrganizationId)) {
    return null;
  }

  return {
    customerId: auth.organization.localOrganizationId,
    customerData: {
      name: auth.organization.name,
      email: auth.user.email,
    },
  };
}
