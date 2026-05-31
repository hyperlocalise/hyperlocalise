import type { OrganizationMembershipRole } from "@/lib/database/types";
import { workosRoleSlugToMembershipRole } from "@/lib/workos/membership-role";

/**
 * Organization capability matrix. Authorization runs only after WorkOS-
 * authoritative membership is established in `workos-session.ts`.
 *
 * Role slugs and scope notes: `./LOCALIZATION_ROLES.md`.
 * Security invariants: `./AUTH_INVARIANTS.md`.
 */
const MEMBER_READ_CAPABILITIES = [
  "workspace:read",
  "projects:read",
  "teams:read",
  "glossaries:read",
  "memories:read",
  "jobs:read",
] as const;

const JOB_CONTRIBUTOR_CAPABILITIES = ["jobs:create", "jobs:write", "ai_actions:run"] as const;

const WRITE_BACK_TRANSLATION_CAPABILITIES = ["write_back:translation"] as const;

const REVIEW_CAPABILITIES = [
  "reviews:read",
  "reviews:approve",
  "write_back:approve",
  "agent_write:approve",
] as const;

/** Technical contributors: projects, sync jobs, integrations visibility; no review or org admin. */
const DEVELOPER_CAPABILITIES = [
  ...MEMBER_READ_CAPABILITIES,
  ...JOB_CONTRIBUTOR_CAPABILITIES,
  ...WRITE_BACK_TRANSLATION_CAPABILITIES,
  "projects:create",
  "projects:write",
  "integrations:read",
] as const;

const LOCALIZATION_MANAGER_CAPABILITIES = [
  ...MEMBER_READ_CAPABILITIES,
  ...JOB_CONTRIBUTOR_CAPABILITIES,
  ...WRITE_BACK_TRANSLATION_CAPABILITIES,
  ...REVIEW_CAPABILITIES,
  "workspace:update",
  "members:invite",
  "teams:write",
  "projects:create",
  "projects:write",
  "glossaries:write",
  "memories:write",
  "provider_credentials:read",
  "provider_credentials:write",
  "api_keys:read",
  "api_keys:write",
  "integrations:read",
  "integrations:write",
  "billing:read",
] as const;

const ADMIN_CAPABILITIES_LIST = ["billing:write", ...LOCALIZATION_MANAGER_CAPABILITIES] as const;

export type OrganizationCapability = (typeof ADMIN_CAPABILITIES_LIST)[number];

export const ORGANIZATION_CAPABILITIES = [
  ...new Set(ADMIN_CAPABILITIES_LIST),
] as readonly OrganizationCapability[];

const MEMBER_CAPABILITIES = new Set<OrganizationCapability>(MEMBER_READ_CAPABILITIES);

const TRANSLATOR_CAPABILITIES = new Set<OrganizationCapability>([
  ...MEMBER_READ_CAPABILITIES,
  ...JOB_CONTRIBUTOR_CAPABILITIES,
  ...WRITE_BACK_TRANSLATION_CAPABILITIES,
]);

const DEVELOPER_CAPABILITY_SET = new Set<OrganizationCapability>(DEVELOPER_CAPABILITIES);

const REVIEWER_CAPABILITIES = new Set<OrganizationCapability>([
  ...MEMBER_READ_CAPABILITIES,
  ...JOB_CONTRIBUTOR_CAPABILITIES,
  ...WRITE_BACK_TRANSLATION_CAPABILITIES,
  ...REVIEW_CAPABILITIES,
]);

const LOCALIZATION_MANAGER_CAPABILITY_SET = new Set<OrganizationCapability>(
  LOCALIZATION_MANAGER_CAPABILITIES,
);

const ADMIN_CAPABILITIES = new Set<OrganizationCapability>(ADMIN_CAPABILITIES_LIST);

const ROLE_CAPABILITIES: Record<OrganizationMembershipRole, ReadonlySet<OrganizationCapability>> = {
  admin: ADMIN_CAPABILITIES,
  localization_manager: LOCALIZATION_MANAGER_CAPABILITY_SET,
  developer: DEVELOPER_CAPABILITY_SET,
  reviewer: REVIEWER_CAPABILITIES,
  translator: TRANSLATOR_CAPABILITIES,
  member: MEMBER_CAPABILITIES,
};

export function getCapabilitiesForRole(role: OrganizationMembershipRole): OrganizationCapability[] {
  return [...(ROLE_CAPABILITIES[role] ?? [])];
}

export function resolveCapabilitiesFromWorkosRoleSlug(
  roleSlug: string | undefined,
): OrganizationCapability[] {
  const role = workosRoleSlugToMembershipRole(roleSlug);
  if (!role) {
    return [];
  }

  return getCapabilitiesForRole(role);
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

/** Workspace operators who can manage integrations, credentials, and members. */
export function isWorkspaceOperatorRole(role: string): boolean {
  return hasCapability(role as OrganizationMembershipRole, "integrations:write");
}

/**
 * @deprecated Prefer `isWorkspaceOperatorRole` or an explicit capability check.
 */
export function isAdminRole(role: string): boolean {
  return isWorkspaceOperatorRole(role);
}

/** Roles that satisfy the "at least one admin" workspace invariant. */
export function isOrganizationAdminRole(role: OrganizationMembershipRole): boolean {
  return role === "admin";
}

export function enrichAuthContextWithCapabilities<
  T extends { membership: { role: OrganizationMembershipRole } },
>(auth: T): T & { capabilities: OrganizationCapability[] } {
  return {
    ...auth,
    capabilities: getCapabilitiesForRole(auth.membership.role),
  };
}
