import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { OrganizationIssueService } from "@/lib/projects/issue-sheet/organization-issue-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

const authFixture = createAuthTestFixture();
const organizationIssueService = new OrganizationIssueService();
const issueSheetService = new IssueSheetService();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createProjectForIdentity() {
  const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Service Test Project",
      identifier: `P${randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase()}`,
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  return { identity, organization, user, project };
}

describe("OrganizationIssueService.getById", () => {
  it("returns an authorized issue with project identity", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;

    const created = await issueSheetService.createIssue({
      organizationId: auth.organization.localOrganizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        title: "Service issue",
        issueType: "general_question",
      },
    });

    const issue = await organizationIssueService.getById(auth, created.id);
    expect(issue).toMatchObject({
      id: created.id,
      title: "Service issue",
      projectId: project.id,
    });
    expect(issue?.projectName).toBe("Service Test Project");
  });

  it("returns null for missing issues", async () => {
    const { identity } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;

    const issue = await organizationIssueService.getById(
      auth,
      "00000000-0000-4000-8000-000000000000",
    );
    expect(issue).toBeNull();
  });

  it("returns null for issues in another workspace", async () => {
    const owner = await createProjectForIdentity();
    const outsider = await createProjectForIdentity();
    await authFixture.authHeadersFor(owner.identity);
    const ownerAuth = globalThis.__testApiAuthContext!;

    const created = await issueSheetService.createIssue({
      organizationId: owner.organization.id,
      projectId: owner.project.id,
      actorUserId: owner.user.id,
      body: {
        title: "Owner only",
        issueType: "general_question",
      },
    });

    await authFixture.authHeadersFor(outsider.identity);
    const outsiderAuth = globalThis.__testApiAuthContext!;

    expect(await organizationIssueService.getById(ownerAuth, created.id)).toMatchObject({
      id: created.id,
    });
    expect(await organizationIssueService.getById(outsiderAuth, created.id)).toBeNull();
  });
});

describe("IssueSheetService.getIssue", () => {
  it("returns null when the issue belongs to another project", async () => {
    const { identity, organization, user, project } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);

    const [otherProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: project.teamId,
        createdByUserId: user.id,
        name: "Other Project",
        identifier: `P${randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase()}`,
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const created = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        title: "Cross project",
        issueType: "general_question",
      },
    });

    const sameProject = await issueSheetService.getIssue({
      organizationId: organization.id,
      projectId: project.id,
      issueId: created.id,
      actorUserId: user.id,
    });
    expect(sameProject?.id).toBe(created.id);

    const otherProjectIssue = await issueSheetService.getIssue({
      organizationId: organization.id,
      projectId: otherProject.id,
      issueId: created.id,
      actorUserId: user.id,
    });
    expect(otherProjectIssue).toBeNull();
  });
});
