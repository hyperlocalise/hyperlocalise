import type { OrganizationMembershipRole } from "@/lib/database/types";

export const ORGANIZATION_CAPABILITIES = [
  "workspace:update",
  "members:invite",
  "teams:write",
  "projects:create",
  "projects:write",
  "glossaries:write",
  "memories:write",
  "provider_credentials:write",
  "api_keys:write",
  "integrations:write",
  "agent_write:approve",
] as const;

export type OrganizationCapability = (typeof ORGANIZATION_CAPABILITIES)[number];

const ADMIN_CAPABILITIES = new Set<OrganizationCapability>(ORGANIZATION_CAPABILITIES);

const ROLE_CAPABILITIES: Record<OrganizationMembershipRole, ReadonlySet<OrganizationCapability>> = {
  owner: ADMIN_CAPABILITIES,
  admin: ADMIN_CAPABILITIES,
  member: new Set<OrganizationCapability>(),
};

export function getCapabilitiesForRole(role: OrganizationMembershipRole): OrganizationCapability[] {
  return [...ROLE_CAPABILITIES[role]];
}

export function hasCapability(
  role: OrganizationMembershipRole,
  capability: OrganizationCapability,
): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function assertCapability(
  role: OrganizationMembershipRole,
  capability: OrganizationCapability,
) {
  if (!hasCapability(role, capability)) {
    throw new Error("forbidden");
  }
}

export function isAdminRole(role: string): boolean {
  return hasCapability(role as OrganizationMembershipRole, "integrations:write");
}

export function enrichAuthContextWithCapabilities<
  T extends { membership: { role: OrganizationMembershipRole } },
>(auth: T): T & { capabilities: OrganizationCapability[] } {
  return {
    ...auth,
    capabilities: getCapabilitiesForRole(auth.membership.role),
  };
}
