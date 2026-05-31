import type { OrganizationMembershipRole } from "@/lib/database/types";

/**
 * Organization capability matrix. Authorization runs only after WorkOS-
 * authoritative membership is established in `workos-session.ts`.
 *
 * Security invariants for access gates, member mutations, and future role work:
 * see `./AUTH_INVARIANTS.md`.
 */
const MEMBER_READ_CAPABILITIES = [
  "workspace:read",
  "projects:read",
  "teams:read",
  "glossaries:read",
  "memories:read",
] as const;

const ADMIN_WRITE_CAPABILITIES = [
  "billing:write",
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

const ADMIN_READ_CAPABILITIES = [
  "billing:read",
  "api_keys:read",
  "provider_credentials:read",
  "integrations:read",
] as const;

export const ORGANIZATION_CAPABILITIES = [
  ...MEMBER_READ_CAPABILITIES,
  ...ADMIN_READ_CAPABILITIES,
  ...ADMIN_WRITE_CAPABILITIES,
] as const;

export type OrganizationCapability = (typeof ORGANIZATION_CAPABILITIES)[number];

const ADMIN_CAPABILITIES = new Set<OrganizationCapability>([
  ...MEMBER_READ_CAPABILITIES,
  ...ADMIN_READ_CAPABILITIES,
  ...ADMIN_WRITE_CAPABILITIES,
]);

const MEMBER_CAPABILITIES = new Set<OrganizationCapability>(MEMBER_READ_CAPABILITIES);

const ROLE_CAPABILITIES: Record<OrganizationMembershipRole, ReadonlySet<OrganizationCapability>> = {
  admin: ADMIN_CAPABILITIES,
  member: MEMBER_CAPABILITIES,
};

export function getCapabilitiesForRole(role: OrganizationMembershipRole): OrganizationCapability[] {
  return [...(ROLE_CAPABILITIES[role] ?? [])];
}

export function hasCapability(
  role: OrganizationMembershipRole,
  capability: OrganizationCapability,
): boolean {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
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
  const capabilities = ROLE_CAPABILITIES[role as OrganizationMembershipRole];
  return capabilities?.has("integrations:write") ?? false;
}

export function enrichAuthContextWithCapabilities<
  T extends { membership: { role: OrganizationMembershipRole } },
>(auth: T): T & { capabilities: OrganizationCapability[] } {
  return {
    ...auth,
    capabilities: getCapabilitiesForRole(auth.membership.role),
  };
}
