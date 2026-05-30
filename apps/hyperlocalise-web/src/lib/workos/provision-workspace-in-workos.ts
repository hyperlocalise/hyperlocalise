import type { OrganizationMembershipRole } from "@/lib/database/types";
import { getWorkosServerClient } from "@/lib/workos/server-client";

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

      const created = await workos.userManagement.createOrganizationMembership({
        organizationId: organization.id,
        userId: member.workosUserId,
        roleSlug: membershipRoleToWorkosRoleSlug(member.role),
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

    throw error;
  }
}
