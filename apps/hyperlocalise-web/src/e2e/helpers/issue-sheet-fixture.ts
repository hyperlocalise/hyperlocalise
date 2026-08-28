/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { enrichAuthContextWithCapabilities } from "@/api/auth/policy";
import { db, schema } from "@/lib/database/client";
import { IssueSheetCommentService } from "@/lib/projects/issue-sheet/issue-sheet-comment-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { toAuthOrganization, withMembershipAccessSource } from "@/test/auth-seed";

import { createEmulatorWorkosClient, roleSlugForE2e } from "./emulator-client";
import type { EmulatorIdentity } from "./emulator-identity";

export type IssueSheetBulkFixture = {
  organizationSlug: string;
  projectId: string;
  issueTitles: [string, string];
};

export async function provisionIssueSheetBulkFixture(
  identity: EmulatorIdentity,
): Promise<IssueSheetBulkFixture> {
  const [organization] = await db
    .select({ id: schema.organizations.id, slug: schema.organizations.slug })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, identity.organizationSlug))
    .limit(1);

  if (!organization?.slug) {
    throw new Error(`E2E organization not found for slug ${identity.organizationSlug}`);
  }

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, identity.workosUserId))
    .limit(1);

  if (!user) {
    throw new Error(`E2E user not found for WorkOS user ${identity.workosUserId}`);
  }

  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const projectId = `project_${randomUUID()}`;

  await db.insert(schema.projects).values({
    id: projectId,
    organizationId: organization.id,
    teamId: team.id,
    createdByUserId: user.id,
    name: `Bulk E2E ${Date.now()}`,
    description: "",
    translationContext: "",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
  });

  const issueSheetService = new IssueSheetService(db);
  const issueTitles = ["Bulk issue one", "Bulk issue two"] as const;

  for (const title of issueTitles) {
    await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId,
      actorUserId: user.id,
      body: { title },
    });
  }

  return {
    organizationSlug: organization.slug,
    projectId,
    issueTitles,
  };
}

export type IssueCommentMentionFixtureMember = {
  displayName: string;
  email: string;
  localUserId: string;
  workosMembershipId: string;
  workosUserId: string;
};

export type IssueCommentMentionFixture = {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  issueTitle: string;
  initialCommentBody: string;
  member: IssueCommentMentionFixtureMember;
};

async function provisionEmulatorOrgMember(input: {
  organizationName: string;
  organizationSlug: string;
  workosOrganizationId: string;
}): Promise<IssueCommentMentionFixtureMember> {
  const workos = createEmulatorWorkosClient();
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-member-${suffix}@example.test`;
  const password = `e2e-password-${suffix}`;
  const firstName = "Mention";
  const lastName = "Target";

  const user = await workos.userManagement.createUser({
    email,
    password,
    emailVerified: true,
    firstName,
    lastName,
  });

  const membership = await workos.userManagement.createOrganizationMembership({
    organizationId: input.workosOrganizationId,
    userId: user.id,
    roleSlug: roleSlugForE2e("member"),
  });

  const synced = await syncWorkosIdentity(db, {
    user: {
      workosUserId: user.id,
      email,
      firstName,
      lastName,
    },
    organization: {
      workosOrganizationId: input.workosOrganizationId,
      name: input.organizationName,
      slug: input.organizationSlug,
    },
    membership: {
      workosMembershipId: membership.id,
      role: "member",
    },
  });

  return {
    displayName: `${firstName} ${lastName}`,
    email,
    localUserId: synced.user.id,
    workosMembershipId: membership.id,
    workosUserId: user.id,
  };
}

export async function provisionIssueCommentMentionFixture(
  identity: EmulatorIdentity,
): Promise<IssueCommentMentionFixture> {
  const [organization] = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      workosOrganizationId: schema.organizations.workosOrganizationId,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, identity.organizationSlug))
    .limit(1);

  if (!organization?.slug || !organization.workosOrganizationId) {
    throw new Error(`E2E organization not found for slug ${identity.organizationSlug}`);
  }

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, identity.workosUserId))
    .limit(1);

  if (!user) {
    throw new Error(`E2E user not found for WorkOS user ${identity.workosUserId}`);
  }

  if (!identity.workosMembershipId) {
    throw new Error("E2E admin identity is missing a WorkOS membership id");
  }

  const member = await provisionEmulatorOrgMember({
    organizationName: organization.name,
    organizationSlug: organization.slug,
    workosOrganizationId: organization.workosOrganizationId,
  });

  const team = await ensureDefaultWorkspaceTeam(organization.id);
  await db
    .insert(schema.teamMemberships)
    .values({
      teamId: team.id,
      userId: member.localUserId,
      role: "member",
    })
    .onConflictDoNothing();

  const projectId = `project_${randomUUID()}`;
  const stamp = Date.now();
  const issueTitle = `Mention issue ${stamp}`;
  const initialCommentBody = "Initial comment without mention";

  await db.insert(schema.projects).values({
    id: projectId,
    organizationId: organization.id,
    teamId: team.id,
    createdByUserId: user.id,
    name: `Mention project ${stamp}`,
    description: "",
    translationContext: "",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
  });

  const issueSheetService = new IssueSheetService(db);
  const issue = await issueSheetService.createIssue({
    organizationId: organization.id,
    projectId,
    actorUserId: user.id,
    body: { title: issueTitle },
  });

  const adminSynced = await syncWorkosIdentity(db, {
    user: {
      workosUserId: identity.workosUserId,
      email: identity.email,
    },
    organization: {
      workosOrganizationId: organization.workosOrganizationId,
      name: organization.name,
      slug: organization.slug,
    },
    membership: {
      workosMembershipId: identity.workosMembershipId,
      role: "admin",
    },
  });
  const activeOrganization = toAuthOrganization(adminSynced.organization, adminSynced.membership);
  const authContext = enrichAuthContextWithCapabilities({
    user: {
      workosUserId: adminSynced.user.workosUserId,
      localUserId: adminSynced.user.id,
      email: adminSynced.user.email,
    },
    organizations: [activeOrganization],
    organization: activeOrganization,
    activeOrganization,
    membership: withMembershipAccessSource({
      workosMembershipId: adminSynced.membership.workosMembershipId,
      role: adminSynced.membership.role,
    }),
    activeTeam: null,
  });

  const commentService = new IssueSheetCommentService(db);
  const created = await commentService.create({
    organizationId: organization.id,
    projectId,
    issueId: issue.id,
    actorUserId: user.id,
    role: "admin",
    auth: authContext,
    body: { body: initialCommentBody },
  });

  if (!created.ok) {
    throw new Error(`Failed to seed issue comment for E2E: ${created.error.code}`);
  }

  return {
    organizationSlug: organization.slug,
    projectId,
    issueId: issue.id,
    issueTitle,
    initialCommentBody,
    member,
  };
}
