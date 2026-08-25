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

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "./project.fixture";

const { resolveApiAuthContextFromSessionMock, workspaceIssuesFlagRunMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceIssuesFlagRunMock: vi.fn(async () => true),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceIssuesFlag: { run: workspaceIssuesFlagRunMock },
  };
});

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

function issueSheet() {
  return client.api.orgs[":organizationSlug"].projects[":projectId"]["issue-sheet"];
}

function orgIssueSheet() {
  return client.api.orgs[":organizationSlug"]["issue-sheet"];
}

afterEach(async () => {
  await projectFixture.cleanup();
});

type IssueResponse = { issue: { id: string; identifier: string; title: string } };

async function createIssue(
  headers: Record<string, string>,
  organizationSlug: string,
  projectId: string,
  title: string,
  externalRef?: string,
) {
  const response = await issueSheet().$post(
    {
      param: { organizationSlug, projectId },
      json: { title, issueType: "general_question", ...(externalRef ? { externalRef } : {}) },
    } as never,
    { headers },
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as IssueResponse;
  return body.issue.id;
}

async function createIssueRecord(
  headers: Record<string, string>,
  organizationSlug: string,
  projectId: string,
  title: string,
) {
  const response = await issueSheet().$post(
    {
      param: { organizationSlug, projectId },
      json: { title, issueType: "general_question" },
    } as never,
    { headers },
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as IssueResponse).issue;
}

type RelationshipResponse = {
  relationship: {
    id: string;
    presentedKind: string;
    otherIssue: { issueId: string; projectId: string; title: string; status: string };
  };
};

type RelationshipListResponse = {
  relationships: Array<{
    id: string;
    presentedKind: string;
    otherIssue: { issueId: string; projectId: string; title: string };
  }>;
};

type FeedResponse = {
  items: Array<
    | {
        kind: "activity";
        activity: {
          type: string;
          relationshipKind?: string;
          relatedIssue?: { issueId: string; title: string | null };
        };
      }
    | { kind: "comment_thread" }
  >;
};

describe("issue relationships", () => {
  it("creates a related relationship, lists it from both sides, and records activity with a title", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssue(headers, organizationSlug, project.id, "Issue A");
    const b = await createIssue(headers, organizationSlug, project.id, "Issue B");

    const createResponse = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: b, kind: "related" },
      } as never,
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as RelationshipResponse;
    expect(created.relationship.presentedKind).toBe("related");
    expect(created.relationship.otherIssue).toMatchObject({ issueId: b, title: "Issue B" });

    const listFromA = await issueSheet()[":issueId"].relationships.$get(
      { param: { organizationSlug, projectId: project.id, issueId: a } } as never,
      { headers },
    );
    const listFromAJson = (await listFromA.json()) as RelationshipListResponse;
    expect(listFromAJson.relationships).toMatchObject([
      { presentedKind: "related", otherIssue: { issueId: b } },
    ]);

    const listFromB = await issueSheet()[":issueId"].relationships.$get(
      { param: { organizationSlug, projectId: project.id, issueId: b } } as never,
      { headers },
    );
    const listFromBJson = (await listFromB.json()) as RelationshipListResponse;
    expect(listFromBJson.relationships).toMatchObject([
      { presentedKind: "related", otherIssue: { issueId: a } },
    ]);

    const feedResponse = await issueSheet()[":issueId"].feed.$get(
      { param: { organizationSlug, projectId: project.id, issueId: a } } as never,
      { headers },
    );
    const feedJson = (await feedResponse.json()) as FeedResponse;
    const relationshipActivity = feedJson.items.find(
      (item) => item.kind === "activity" && item.activity.type === "relationship_added",
    );
    expect(relationshipActivity).toMatchObject({
      kind: "activity",
      activity: {
        type: "relationship_added",
        relationshipKind: "related",
        relatedIssue: { issueId: b, title: "Issue B" },
      },
    });
  });

  it("lists relationships and feed when the URL uses a PREFIX-N identifier", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssueRecord(headers, organizationSlug, project.id, "Issue A");
    const b = await createIssueRecord(headers, organizationSlug, project.id, "Issue B");

    const createResponse = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a.identifier },
        json: { relatedIssueId: b.id, kind: "related" },
      } as never,
      { headers },
    );
    expect(createResponse.status).toBe(201);

    const listResponse = await issueSheet()[":issueId"].relationships.$get(
      { param: { organizationSlug, projectId: project.id, issueId: a.identifier } } as never,
      { headers },
    );
    expect(listResponse.status).toBe(200);
    const listJson = (await listResponse.json()) as RelationshipListResponse;
    expect(listJson.relationships).toMatchObject([
      { presentedKind: "related", otherIssue: { issueId: b.id } },
    ]);

    const feedResponse = await issueSheet()[":issueId"].feed.$get(
      { param: { organizationSlug, projectId: project.id, issueId: a.identifier } } as never,
      { headers },
    );
    expect(feedResponse.status).toBe(200);
    const feedJson = (await feedResponse.json()) as FeedResponse;
    expect(feedJson.items.some((item) => item.kind === "activity")).toBe(true);
  });

  it("stores blocked_by as an inverted blocks edge, readable correctly from both sides", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssue(headers, organizationSlug, project.id, "Blocked issue");
    const b = await createIssue(headers, organizationSlug, project.id, "Blocking issue");

    // A is blocked by B.
    const createResponse = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: b, kind: "blocked_by" },
      } as never,
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as RelationshipResponse;
    expect(created.relationship.presentedKind).toBe("blocked_by");

    const [storedRow] = await db
      .select({
        issueId: schema.issueSheetRelationships.issueId,
        kind: schema.issueSheetRelationships.kind,
      })
      .from(schema.issueSheetRelationships)
      .where(eq(schema.issueSheetRelationships.id, created.relationship.id));
    // Stored as B blocks A, not A blocked_by B.
    expect(storedRow).toMatchObject({ issueId: b, kind: "blocks" });

    const listFromB = await issueSheet()[":issueId"].relationships.$get(
      { param: { organizationSlug, projectId: project.id, issueId: b } } as never,
      { headers },
    );
    const listFromBJson = (await listFromB.json()) as RelationshipListResponse;
    expect(listFromBJson.relationships).toMatchObject([
      { presentedKind: "blocks", otherIssue: { issueId: a } },
    ]);
  });

  it("rejects a blocking cycle", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssue(headers, organizationSlug, project.id, "A");
    const b = await createIssue(headers, organizationSlug, project.id, "B");

    const first = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: b, kind: "blocks" },
      } as never,
      { headers },
    );
    expect(first.status).toBe(201);

    const second = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: b },
        json: { relatedIssueId: a, kind: "blocks" },
      } as never,
      { headers },
    );
    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toMatchObject({ error: "blocking_relationship_cycle" });
  });

  // Regression for a race the pre-checks alone can't catch: the edge_key unique
  // index is directional (issueId, relatedIssueId, kind), so it never conflicts
  // for a reversed pair. Two opposite-direction requests fired concurrently can
  // both pass the cycle check before either commits unless the check-and-insert
  // is serialized (see lockRelationshipMutations in issue-relationship-service.ts).
  it("rejects a blocking cycle even when both directions are created concurrently", async () => {
    const { identity, project, organization } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssue(headers, organizationSlug, project.id, "A");
    const b = await createIssue(headers, organizationSlug, project.id, "B");

    const [first, second] = await Promise.all([
      issueSheet()[":issueId"].relationships.$post(
        {
          param: { organizationSlug, projectId: project.id, issueId: a },
          json: { relatedIssueId: b, kind: "blocks" },
        } as never,
        { headers },
      ),
      issueSheet()[":issueId"].relationships.$post(
        {
          param: { organizationSlug, projectId: project.id, issueId: b },
          json: { relatedIssueId: a, kind: "blocks" },
        } as never,
        { headers },
      ),
    ]);

    // Whichever request the lock let through first, exactly one must win and
    // the other must be rejected as a cycle — never both succeeding, which
    // would leave a live A-blocks-B-blocks-A cycle in the database.
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 400]);

    const rejected = first.status === 400 ? first : second;
    await expect(rejected.json()).resolves.toMatchObject({ error: "blocking_relationship_cycle" });

    const blocksRows = await db
      .select({ id: schema.issueSheetRelationships.id })
      .from(schema.issueSheetRelationships)
      .where(
        and(
          eq(schema.issueSheetRelationships.organizationId, organization.id),
          eq(schema.issueSheetRelationships.kind, "blocks"),
        ),
      );
    expect(blocksRows).toHaveLength(1);
  });

  it("rejects marking an issue as duplicate twice, and rejects a duplicate cycle", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssue(headers, organizationSlug, project.id, "A");
    const b = await createIssue(headers, organizationSlug, project.id, "B");
    const c = await createIssue(headers, organizationSlug, project.id, "C");

    const first = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: b, kind: "duplicate_of" },
      } as never,
      { headers },
    );
    expect(first.status).toBe(201);

    const secondCanonical = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: c, kind: "duplicate_of" },
      } as never,
      { headers },
    );
    expect(secondCanonical.status).toBe(409);
    await expect(secondCanonical.json()).resolves.toMatchObject({
      error: "issue_already_marked_duplicate",
    });

    const cycle = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: b },
        json: { relatedIssueId: a, kind: "duplicate_of" },
      } as never,
      { headers },
    );
    expect(cycle.status).toBe(400);
    await expect(cycle.json()).resolves.toMatchObject({ error: "duplicate_relationship_cycle" });
  });

  it("rejects a duplicate related relationship and self-relate", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssue(headers, organizationSlug, project.id, "A");
    const b = await createIssue(headers, organizationSlug, project.id, "B");

    const first = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: b, kind: "related" },
      } as never,
      { headers },
    );
    expect(first.status).toBe(201);

    const reverse = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: b },
        json: { relatedIssueId: a, kind: "related" },
      } as never,
      { headers },
    );
    expect(reverse.status).toBe(409);
    await expect(reverse.json()).resolves.toMatchObject({ error: "relationship_already_exists" });

    const selfRelate = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: a, kind: "related" },
      } as never,
      { headers },
    );
    expect(selfRelate.status).toBe(400);
    await expect(selfRelate.json()).resolves.toMatchObject({
      error: "relationship_target_is_self",
    });
  });

  it("404s for a nonexistent related issue", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const a = await createIssue(headers, organizationSlug, project.id, "A");

    const response = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: randomUUID(), kind: "related" },
      } as never,
      { headers },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "related_issue_not_found" });
  });

  it("404s without leaking a title for an issue outside the actor's workspace", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const outsider = await projectFixture.createStoredProjectFixture();
    const ownerHeaders = await projectFixture.authHeadersFor(owner.identity);
    const outsiderHeaders = await projectFixture.authHeadersFor(outsider.identity);
    const ownerSlug = owner.identity.organization.slug ?? "missing-slug";
    const outsiderSlug = outsider.identity.organization.slug ?? "missing-slug";

    const privateIssue = await createIssue(
      ownerHeaders,
      ownerSlug,
      owner.project.id,
      "Confidential title",
    );
    const outsiderIssue = await createIssue(
      outsiderHeaders,
      outsiderSlug,
      outsider.project.id,
      "Outsider issue",
    );

    const response = await issueSheet()[":issueId"].relationships.$post(
      {
        param: {
          organizationSlug: outsiderSlug,
          projectId: outsider.project.id,
          issueId: outsiderIssue,
        },
        json: { relatedIssueId: privateIssue, kind: "related" },
      } as never,
      { headers: outsiderHeaders },
    );
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("Confidential title");
  });

  it("deletes a relationship from either side without touching either issue", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const a = await createIssue(headers, organizationSlug, project.id, "A");
    const b = await createIssue(headers, organizationSlug, project.id, "B");

    const createResponse = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: project.id, issueId: a },
        json: { relatedIssueId: b, kind: "related" },
      } as never,
      { headers },
    );
    const created = (await createResponse.json()) as RelationshipResponse;

    // Delete from B's side, the non-storing side.
    const deleteResponse = await issueSheet()[":issueId"].relationships[":relationshipId"].$delete(
      {
        param: {
          organizationSlug,
          projectId: project.id,
          issueId: b,
          relationshipId: created.relationship.id,
        },
      } as never,
      { headers },
    );
    expect(deleteResponse.status).toBe(204);

    const listFromA = await issueSheet()[":issueId"].relationships.$get(
      { param: { organizationSlug, projectId: project.id, issueId: a } } as never,
      { headers },
    );
    const listFromAJson = (await listFromA.json()) as RelationshipListResponse;
    expect(listFromAJson.relationships).toHaveLength(0);

    const [issueARow] = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(eq(schema.issueSheetIssues.id, a));
    const [issueBRow] = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(eq(schema.issueSheetIssues.id, b));
    expect(issueARow).toBeDefined();
    expect(issueBRow).toBeDefined();

    const feedResponse = await issueSheet()[":issueId"].feed.$get(
      { param: { organizationSlug, projectId: project.id, issueId: b } } as never,
      { headers },
    );
    const feedJson = (await feedResponse.json()) as FeedResponse;
    expect(
      feedJson.items.some(
        (item) => item.kind === "activity" && item.activity.type === "relationship_removed",
      ),
    ).toBe(true);
  });

  // The route authorizes the projectId in the URL, but the issueId must also be
  // verified to live in that project — otherwise an accessible project id can be
  // paired with an issue from a project the actor cannot reach.
  it("rejects an issueId that does not belong to the projectId in the URL", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(owner.identity);
    const organizationSlug = owner.identity.organization.slug ?? "missing-slug";

    const [otherProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: owner.organization.id,
        teamId: owner.project.teamId,
        createdByUserId: owner.user.id,
        name: "Other Project",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const foreignIssue = await createIssue(
      headers,
      organizationSlug,
      otherProject.id,
      "Issue in the other project",
    );
    const foreignTarget = await createIssue(
      headers,
      organizationSlug,
      otherProject.id,
      "Target in the other project",
    );
    const ownIssue = await createIssue(headers, organizationSlug, owner.project.id, "Own issue");

    // Seed a relationship on the foreign issue, from its own (correct) project.
    const seeded = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: otherProject.id, issueId: foreignIssue },
        json: { relatedIssueId: ownIssue, kind: "related" },
      } as never,
      { headers },
    );
    expect(seeded.status).toBe(201);
    const seededRelationshipId = ((await seeded.json()) as RelationshipResponse).relationship.id;

    // GET: owner.project.id is accessible, but foreignIssue does not live in it.
    const listResponse = await issueSheet()[":issueId"].relationships.$get(
      { param: { organizationSlug, projectId: owner.project.id, issueId: foreignIssue } } as never,
      { headers },
    );
    expect(listResponse.status).toBe(404);
    const listBody = await listResponse.text();
    expect(listBody).not.toContain(seededRelationshipId);

    // POST: must not create a row whose projectId disagrees with its issueId's project.
    const createResponse = await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: owner.project.id, issueId: foreignIssue },
        json: { relatedIssueId: foreignTarget, kind: "blocks" },
      } as never,
      { headers },
    );
    expect(createResponse.status).toBe(404);
    const blocksRows = await db
      .select({ id: schema.issueSheetRelationships.id })
      .from(schema.issueSheetRelationships)
      .where(
        and(
          eq(schema.issueSheetRelationships.issueId, foreignIssue),
          eq(schema.issueSheetRelationships.kind, "blocks"),
        ),
      );
    expect(blocksRows).toHaveLength(0);

    // DELETE: must not remove a relationship reached through a mismatched project.
    const deleteResponse = await issueSheet()[":issueId"].relationships[":relationshipId"].$delete(
      {
        param: {
          organizationSlug,
          projectId: owner.project.id,
          issueId: foreignIssue,
          relationshipId: seededRelationshipId,
        },
      } as never,
      { headers },
    );
    expect(deleteResponse.status).toBe(404);
    const survivingRows = await db
      .select({ id: schema.issueSheetRelationships.id })
      .from(schema.issueSheetRelationships)
      .where(eq(schema.issueSheetRelationships.id, seededRelationshipId));
    expect(survivingRows).toHaveLength(1);
  });

  it("renders relationship titles same-project but not cross-project on the feed", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(owner.identity);
    const organizationSlug = owner.identity.organization.slug ?? "missing-slug";

    const [otherProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: owner.organization.id,
        teamId: owner.project.teamId,
        createdByUserId: owner.user.id,
        name: "Other Project",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const a = await createIssue(headers, organizationSlug, owner.project.id, "A same project");
    const sameProjectTarget = await createIssue(
      headers,
      organizationSlug,
      owner.project.id,
      "Same project target",
    );
    const crossProjectTarget = await createIssue(
      headers,
      organizationSlug,
      otherProject.id,
      "Cross project target",
    );

    await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: owner.project.id, issueId: a },
        json: { relatedIssueId: sameProjectTarget, kind: "related" },
      } as never,
      { headers },
    );
    await issueSheet()[":issueId"].relationships.$post(
      {
        param: { organizationSlug, projectId: owner.project.id, issueId: a },
        json: { relatedIssueId: crossProjectTarget, kind: "related" },
      } as never,
      { headers },
    );

    const feedResponse = await issueSheet()[":issueId"].feed.$get(
      { param: { organizationSlug, projectId: owner.project.id, issueId: a } } as never,
      { headers },
    );
    const feedJson = (await feedResponse.json()) as FeedResponse;
    const added = feedJson.items.filter(
      (item) => item.kind === "activity" && item.activity.type === "relationship_added",
    ) as Array<{
      kind: "activity";
      activity: { relatedIssue: { issueId: string; title: string | null } };
    }>;

    const sameProjectActivity = added.find(
      (item) => item.activity.relatedIssue.issueId === sameProjectTarget,
    );
    const crossProjectActivity = added.find(
      (item) => item.activity.relatedIssue.issueId === crossProjectTarget,
    );
    expect(sameProjectActivity?.activity.relatedIssue.title).toBe("Same project target");
    expect(crossProjectActivity?.activity.relatedIssue.title).toBeNull();
  });
});

describe("issue search", () => {
  it("matches by title/externalRef, excludes self, scopes by access, respects limit, and isn't captured by /:issueId", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const outsider = await projectFixture.createStoredProjectFixture();
    const ownerHeaders = await projectFixture.authHeadersFor(owner.identity);
    const ownerSlug = owner.identity.organization.slug ?? "missing-slug";
    const outsiderHeaders = await projectFixture.authHeadersFor(outsider.identity);

    const target = await createIssue(
      ownerHeaders,
      ownerSlug,
      owner.project.id,
      "Findable by title",
    );
    const byRef = await createIssue(
      ownerHeaders,
      ownerSlug,
      owner.project.id,
      "Unrelated title",
      "REF-123",
    );
    const newest = await createIssue(
      ownerHeaders,
      ownerSlug,
      owner.project.id,
      "Something else entirely",
    );

    const titleSearch = await orgIssueSheet().search.$get(
      { param: { organizationSlug: ownerSlug }, query: { q: "Findable" } } as never,
      { headers: ownerHeaders },
    );
    expect(titleSearch.status).toBe(200);
    const titleSearchJson = (await titleSearch.json()) as { issues: Array<{ issueId: string }> };
    expect(titleSearchJson.issues.map((issue) => issue.issueId)).toEqual([target]);

    const refSearch = await orgIssueSheet().search.$get(
      { param: { organizationSlug: ownerSlug }, query: { q: "REF-123" } } as never,
      { headers: ownerHeaders },
    );
    const refSearchJson = (await refSearch.json()) as { issues: Array<{ issueId: string }> };
    expect(refSearchJson.issues.map((issue) => issue.issueId)).toEqual([byRef]);

    const excludeSearch = await orgIssueSheet().search.$get(
      {
        param: { organizationSlug: ownerSlug },
        query: { q: "Findable", excludeIssueId: target },
      } as never,
      { headers: ownerHeaders },
    );
    const excludeSearchJson = (await excludeSearch.json()) as { issues: unknown[] };
    expect(excludeSearchJson.issues).toHaveLength(0);

    const outsiderSearch = await orgIssueSheet().search.$get(
      { param: { organizationSlug: ownerSlug }, query: { q: "Findable" } } as never,
      { headers: outsiderHeaders },
    );
    // The outsider's session isn't a member of the owner's org, so auth resolution
    // falls back to the outsider's own org regardless of the URL's organizationSlug —
    // scoping the search to their own (empty) org rather than leaking the owner's issue.
    expect(outsiderSearch.status).toBe(200);
    const outsiderSearchJson = (await outsiderSearch.json()) as { issues: unknown[] };
    expect(outsiderSearchJson.issues).toHaveLength(0);

    const limitedSearch = await orgIssueSheet().search.$get(
      { param: { organizationSlug: ownerSlug }, query: { q: "", limit: "1" } } as never,
      { headers: ownerHeaders },
    );
    const limitedSearchJson = (await limitedSearch.json()) as {
      issues: Array<{ issueId: string }>;
    };
    expect(limitedSearchJson.issues.length).toBe(1);
    // Most-recently-updated first: with limit 1 the newest issue wins, not the oldest.
    expect(limitedSearchJson.issues[0]?.issueId).toBe(newest);
  });
});
