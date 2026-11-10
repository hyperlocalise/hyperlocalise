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

import { hasOrganizationWideProjectAccess } from "@/api/auth/team-access";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { ensureDefaultNativeProjectMemory } from "@/lib/memory/ensure-default-native-project-memory";
import { insertWithAllocatedProjectIdentifier } from "@/lib/projects/issue-identifier/allocate-issue-identifier";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import {
  ensureDefaultWorkspaceTeam,
  ensureTeamMembership,
} from "@/lib/teams/default-workspace-team";

type CreateProjectInput = Partial<{
  name: string;
  description: string;
  translationContext: string;
  sourceLocale: string;
  targetLocales: string[];
  teamId: string;
}>;

export function createProjectTestFixture() {
  const authFixture = createAuthTestFixture();

  // Native project creation is served by go-svc. Tests that need a project
  // created the way that endpoint does it use this direct insert. It returns a
  // 201 `{ project }` response so existing callers keep reading it the same way.
  async function createProjectViaApi(identity: WorkosAuthIdentity, input?: CreateProjectInput) {
    const auth = await authFixture.authContextFor(identity);
    const organizationId = auth.organization.localOrganizationId;
    const teamId = input?.teamId ?? (await ensureDefaultWorkspaceTeam(organizationId)).id;
    const [project] = await insertWithAllocatedProjectIdentifier({
      organizationId,
      name: input?.name ?? "Marketing Site",
      insert: async (identifier, attemptDb) => {
        const created = await attemptDb
          .insert(schema.projects)
          .values({
            id: `project_${randomUUID()}`,
            organizationId,
            teamId,
            createdByUserId: auth.user.localUserId,
            name: input?.name ?? "Marketing Site",
            identifier,
            description: input?.description ?? "Primary website strings",
            translationContext:
              input?.translationContext ?? "Use a concise product-marketing tone.",
            source: "native",
            sourceLocale: input?.sourceLocale ?? "en-US",
            targetLocales: input?.targetLocales ?? ["fr-FR", "de-DE"],
          })
          .returning();
        const createdProject = created[0];
        if (createdProject) {
          await ensureDefaultNativeProjectMemory({
            organizationId,
            projectId: createdProject.id,
            projectName: createdProject.name,
            createdByUserId: auth.user.localUserId,
            database: attemptDb,
          });
        }
        return created;
      },
    });

    if (!hasOrganizationWideProjectAccess(auth)) {
      await ensureTeamMembership({
        teamId,
        userId: auth.user.localUserId,
        role: "member",
      });
    }

    return Response.json({ project: { ...project, openJobCount: 0 } }, { status: 201 });
  }

  async function createStoredProjectFixture() {
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Docs",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    return { identity, organization, user, project };
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createLocalWorkosIdentity: authFixture.createLocalWorkosIdentity,
    createProjectViaApi,
    createStoredProjectFixture,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
    trackWorkosUserId: authFixture.trackWorkosUserId,
  };
}
