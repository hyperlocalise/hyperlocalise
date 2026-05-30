import type { OrganizationMembershipRole } from "@/lib/database/types";
import { createLogger } from "@/lib/log";
import { getWorkosServerClient } from "@/lib/workos/server-client";
import { serializeWorkosErrorForLog } from "@/lib/workos/serialize-workos-error-for-log";

const logger = createLogger("provision-workspace-in-workos");

export type ProvisionWorkspaceMember = {
  workosUserId: string;
  role: OrganizationMembershipRole;
};

export type ProvisionWorkspaceInWorkosInput = {
  localWorkspaceId: string;
  organizationName: string;
  members: ProvisionWorkspaceMember[];
};

export type ProvisionedWorkspaceMember = {
  workosUserId: string;
  workosMembershipId: string;
  role: OrganizationMembershipRole;
};

export type ProvisionWorkspaceInWorkosResult = {
  workosOrganizationId: string;
  members: ProvisionedWorkspaceMember[];
};

function membershipRoleToWorkosRoleSlug(role: OrganizationMembershipRole) {
  if (role === "owner" || role === "admin") {
    return role;
  }

  return "member";
}

export async function deleteProvisionedWorkosOrganization(workosOrganizationId: string) {
  const workos = getWorkosServerClient();
  if (!workos) {
    return;
  }

  try {
    await workos.organizations.deleteOrganization(workosOrganizationId);
  } catch {
    // Best-effort cleanup; preserve the original failure.
  }
}

export type PromoteLocalOrganizationForWorkosUserInput = {
  localWorkspaceId: string;
  organizationName: string;
  workosUserId: string;
  role: OrganizationMembershipRole;
};

export type PromoteLocalOrganizationForWorkosUserResult = {
  workosOrganizationId: string;
  workosMembershipId: string;
  role: OrganizationMembershipRole;
};

/**
 * Promotes a legacy local workspace by creating a WorkOS organization and assigning
 * an existing WorkOS user. Does not create users or touch other members.
 */
export async function promoteLocalOrganizationForWorkosUser(
  input: PromoteLocalOrganizationForWorkosUserInput,
): Promise<PromoteLocalOrganizationForWorkosUserResult> {
  const workos = getWorkosServerClient();

  if (!workos) {
    throw new Error("workos_organization_required");
  }

  let workosOrganizationId: string | undefined;
  let roleSlug: string | undefined;

  try {
    const organization = await workos.organizations.createOrganization(
      {
        name: input.organizationName,
        externalId: input.localWorkspaceId,
        metadata: {
          hyperlocalise_local_organization_id: input.localWorkspaceId,
        },
      },
      { idempotencyKey: `workspace:${input.localWorkspaceId}` },
    );
    workosOrganizationId = organization.id;

    const existingMembershipsPage = await workos.userManagement.listOrganizationMemberships({
      organizationId: organization.id,
      userId: input.workosUserId,
      statuses: ["active"],
    });
    const existingMemberships = await existingMembershipsPage.autoPagination();
    const existingMembership = existingMemberships[0];

    if (existingMembership) {
      return {
        workosOrganizationId: organization.id,
        workosMembershipId: existingMembership.id,
        role: input.role,
      };
    }

    roleSlug = membershipRoleToWorkosRoleSlug(input.role);
    const createdMembership = await workos.userManagement.createOrganizationMembership({
      organizationId: organization.id,
      userId: input.workosUserId,
      roleSlug,
    });

    return {
      workosOrganizationId: organization.id,
      workosMembershipId: createdMembership.id,
      role: input.role,
    };
  } catch (error) {
    if (workosOrganizationId) {
      await deleteProvisionedWorkosOrganization(workosOrganizationId);
    }

    logger.warn("workos_local_org_promotion_failed", {
      localWorkspaceId: input.localWorkspaceId,
      workosOrganizationId,
      workosUserId: input.workosUserId,
      roleSlug,
      ...serializeWorkosErrorForLog(error),
    });

    throw error;
  }
}

/**
 * Creates (or idempotently reuses) a WorkOS organization and active memberships.
 * Uses `externalId = localWorkspaceId` so legacy local workspaces can be promoted safely.
 */
export async function provisionWorkspaceInWorkos(
  input: ProvisionWorkspaceInWorkosInput,
): Promise<ProvisionWorkspaceInWorkosResult> {
  const workos = getWorkosServerClient();

  if (!workos) {
    throw new Error("workos_organization_required");
  }

  let workosOrganizationId: string | undefined;
  let lastAttemptedMember:
    | {
        workosUserId: string;
        roleSlug: string;
      }
    | undefined;

  try {
    const organization = await workos.organizations.createOrganization(
      {
        name: input.organizationName,
        externalId: input.localWorkspaceId,
        metadata: {
          hyperlocalise_local_organization_id: input.localWorkspaceId,
        },
      },
      { idempotencyKey: `workspace:${input.localWorkspaceId}` },
    );
    workosOrganizationId = organization.id;

    const existingMembershipsPage = await workos.userManagement.listOrganizationMemberships({
      organizationId: organization.id,
      statuses: ["active"],
    });
    const existingMemberships = await existingMembershipsPage.autoPagination();
    const membershipByUserId = new Map(
      existingMemberships.map((membership) => [membership.userId, membership]),
    );

    const provisionedMembers: ProvisionedWorkspaceMember[] = [];

    for (const member of input.members) {
      const existing = membershipByUserId.get(member.workosUserId);
      if (existing) {
        provisionedMembers.push({
          workosUserId: member.workosUserId,
          workosMembershipId: existing.id,
          role: member.role,
        });
        continue;
      }

      const roleSlug = membershipRoleToWorkosRoleSlug(member.role);
      lastAttemptedMember = {
        workosUserId: member.workosUserId,
        roleSlug,
      };

      const created = await workos.userManagement.createOrganizationMembership({
        organizationId: organization.id,
        userId: member.workosUserId,
        roleSlug,
      });

      provisionedMembers.push({
        workosUserId: member.workosUserId,
        workosMembershipId: created.id,
        role: member.role,
      });
    }

    return {
      workosOrganizationId: organization.id,
      members: provisionedMembers,
    };
  } catch (error) {
    if (workosOrganizationId) {
      await deleteProvisionedWorkosOrganization(workosOrganizationId);
    }

    logger.warn("workos_workspace_provision_failed", {
      localWorkspaceId: input.localWorkspaceId,
      workosOrganizationId,
      memberCount: input.members.length,
      lastAttemptedWorkosUserId: lastAttemptedMember?.workosUserId,
      lastAttemptedRoleSlug: lastAttemptedMember?.roleSlug,
      ...serializeWorkosErrorForLog(error),
    });

    throw error;
  }
}
