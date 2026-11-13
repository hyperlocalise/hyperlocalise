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
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
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
      identifier: uniqueTestProjectIdentifier(),
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Service Test Project",
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

    const issue = await organizationIssueService.getById(auth, created.identifier);
    expect(issue).toMatchObject({
      id: created.id,
      identifier: created.identifier,
      title: "Service issue",
      projectId: project.id,
    });
    expect(issue?.identifier).toMatch(/^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]*$/);
    expect(issue?.projectName).toBe("Service Test Project");
  });

  it("returns null for missing issues", async () => {
    const { identity } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;

    const issue = await organizationIssueService.getById(auth, "ZZZ-99999");
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

    expect(await organizationIssueService.getById(ownerAuth, created.identifier)).toMatchObject({
      id: created.id,
    });
    expect(await organizationIssueService.getById(outsiderAuth, created.identifier)).toBeNull();
  });
});

describe("OrganizationIssueService.list", () => {
  it("scopes summary counts to the current list filters", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;

    await issueSheetService.createIssue({
      organizationId: auth.organization.localOrganizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        title: "Open query",
        issueType: "general_question",
      },
    });
    await issueSheetService.createIssue({
      organizationId: auth.organization.localOrganizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        title: "Won't fix query",
        issueType: "general_question",
        status: "wont_fix",
      },
    });

    const openView = await organizationIssueService.list(auth, {
      view: "all_open",
      sort: "status",
      limit: 50,
      offset: 0,
    });
    expect(openView.issues.map((issue) => issue.status)).toEqual(["open"]);
    expect(openView.summary).toEqual({
      total: 1,
      open: 1,
      inProgress: 0,
      resolved: 0,
      wontFix: 0,
    });

    const wontFixView = await organizationIssueService.list(auth, {
      view: "all_open",
      status: "wont_fix",
      sort: "status",
      limit: 50,
      offset: 0,
    });
    expect(wontFixView.issues.map((issue) => issue.status)).toEqual(["wont_fix"]);
    expect(wontFixView.summary).toEqual({
      total: 1,
      open: 0,
      inProgress: 0,
      resolved: 0,
      wontFix: 1,
    });
  });
});

describe("IssueSheetService.listIssues", () => {
  it("scopes summary counts to the current list filters", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    await issueSheetService.createIssue({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        title: "Open query",
        issueType: "general_question",
      },
    });
    await issueSheetService.createIssue({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        title: "Won't fix query",
        issueType: "general_question",
        status: "wont_fix",
      },
    });

    const openView = await issueSheetService.listIssues({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      query: { view: "all_open", sort: "status", limit: 50, offset: 0 },
    });
    expect(openView.issues.map((issue) => issue.status)).toEqual(["open"]);
    expect(openView.summary).toEqual({
      total: 1,
      open: 1,
      inProgress: 0,
      resolved: 0,
      wontFix: 0,
    });

    const wontFixView = await issueSheetService.listIssues({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      query: { view: "all_open", status: "wont_fix", sort: "status", limit: 50, offset: 0 },
    });
    expect(wontFixView.issues.map((issue) => issue.status)).toEqual(["wont_fix"]);
    expect(wontFixView.summary).toEqual({
      total: 1,
      open: 0,
      inProgress: 0,
      resolved: 0,
      wontFix: 1,
    });
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
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: project.teamId,
        createdByUserId: user.id,
        name: "Other Project",
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
      issueId: created.identifier,
      actorUserId: user.id,
    });
    expect(sameProject?.id).toBe(created.id);

    const otherProjectIssue = await issueSheetService.getIssue({
      organizationId: organization.id,
      projectId: otherProject.id,
      issueId: created.identifier,
      actorUserId: user.id,
    });
    expect(otherProjectIssue).toBeNull();
  });
});
