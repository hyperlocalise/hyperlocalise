import { randomUUID } from "node:crypto";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { isFixtureAuthEnabled } from "@/lib/e2e/config";
import { createLogger } from "@/lib/log";
import {
  membershipRoleFromUnknownRoleField,
  membershipRoleToWorkosRoleSlug,
} from "@/lib/workos/membership-role";
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

/** Creates (or idempotently reuses) a WorkOS organization and active memberships. */
export async function provisionWorkspaceInWorkos(
  input: ProvisionWorkspaceInWorkosInput,
): Promise<ProvisionWorkspaceInWorkosResult> {
  if (isFixtureAuthEnabled()) {
    return {
      workosOrganizationId: `org_fixture_${input.localWorkspaceId}`,
      members: input.members.map((member) => ({
        workosUserId: member.workosUserId,
        workosMembershipId: `om_fixture_${randomUUID()}`,
        role: member.role,
      })),
    };
  }

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
          role: membershipRoleFromUnknownRoleField(existing.role) ?? member.role,
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
