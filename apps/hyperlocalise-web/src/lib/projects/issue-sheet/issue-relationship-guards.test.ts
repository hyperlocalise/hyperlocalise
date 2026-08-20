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

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";

import { wouldCreateCycle } from "./issue-relationship-guards";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createIssue(organizationId: string, projectId: string, title: string) {
  const [issue] = await db
    .insert(schema.issueSheetIssues)
    .values({ organizationId, projectId, title })
    .returning({ id: schema.issueSheetIssues.id });
  return issue!.id;
}

async function addEdge(
  organizationId: string,
  projectId: string,
  issueId: string,
  relatedIssueId: string,
  kind: "blocks" | "duplicate_of",
) {
  await db.insert(schema.issueSheetRelationships).values({
    organizationId,
    projectId,
    issueId,
    relatedIssueId,
    kind,
  });
}

describe("wouldCreateCycle", () => {
  it("accepts an edge between unrelated issues", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const a = await createIssue(organization.id, project.id, "A");
    const b = await createIssue(organization.id, project.id, "B");
    const c = await createIssue(organization.id, project.id, "C");
    await addEdge(organization.id, project.id, a, b, "blocks");

    const cycle = await wouldCreateCycle({
      organizationId: organization.id,
      kind: "blocks",
      fromIssueId: a,
      toIssueId: c,
    });
    expect(cycle).toBe(false);
  });

  it("rejects a direct 2-hop blocks cycle", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const a = await createIssue(organization.id, project.id, "A");
    const b = await createIssue(organization.id, project.id, "B");
    await addEdge(organization.id, project.id, a, b, "blocks");

    // B blocks A would close the loop A -> B -> A.
    const cycle = await wouldCreateCycle({
      organizationId: organization.id,
      kind: "blocks",
      fromIssueId: b,
      toIssueId: a,
    });
    expect(cycle).toBe(true);
  });

  it("rejects a 3-hop blocks cycle", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const a = await createIssue(organization.id, project.id, "A");
    const b = await createIssue(organization.id, project.id, "B");
    const c = await createIssue(organization.id, project.id, "C");
    await addEdge(organization.id, project.id, a, b, "blocks");
    await addEdge(organization.id, project.id, b, c, "blocks");

    // C blocks A would close the loop A -> B -> C -> A.
    const cycle = await wouldCreateCycle({
      organizationId: organization.id,
      kind: "blocks",
      fromIssueId: c,
      toIssueId: a,
    });
    expect(cycle).toBe(true);
  });

  it("accepts extending a duplicate_of chain", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const a = await createIssue(organization.id, project.id, "A");
    const b = await createIssue(organization.id, project.id, "B");
    const c = await createIssue(organization.id, project.id, "C");
    await addEdge(organization.id, project.id, a, b, "duplicate_of");

    // C duplicate_of A is a valid chain (C -> A -> B), not a cycle.
    const cycle = await wouldCreateCycle({
      organizationId: organization.id,
      kind: "duplicate_of",
      fromIssueId: c,
      toIssueId: a,
    });
    expect(cycle).toBe(false);
  });

  it("rejects a duplicate_of cycle", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const a = await createIssue(organization.id, project.id, "A");
    const b = await createIssue(organization.id, project.id, "B");
    await addEdge(organization.id, project.id, a, b, "duplicate_of");

    // B duplicate_of A would close the loop A -> B -> A.
    const cycle = await wouldCreateCycle({
      organizationId: organization.id,
      kind: "duplicate_of",
      fromIssueId: b,
      toIssueId: a,
    });
    expect(cycle).toBe(true);
  });

  it("scopes the graph walk to the given organization", async () => {
    const fixtureA = await projectFixture.createStoredProjectFixture();
    const fixtureB = await projectFixture.createStoredProjectFixture();
    const a = await createIssue(fixtureA.organization.id, fixtureA.project.id, "A");
    const b = await createIssue(fixtureA.organization.id, fixtureA.project.id, "B");
    await addEdge(fixtureA.organization.id, fixtureA.project.id, a, b, "blocks");

    // Same edge shape, but checked under a different organization — must not see fixtureA's edge.
    const cycle = await wouldCreateCycle({
      organizationId: fixtureB.organization.id,
      kind: "blocks",
      fromIssueId: b,
      toIssueId: a,
    });
    expect(cycle).toBe(false);
  });
});
