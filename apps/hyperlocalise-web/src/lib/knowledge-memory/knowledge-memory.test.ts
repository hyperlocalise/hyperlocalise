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
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  commitKnowledgeMemoryForOrganization,
  commitKnowledgeMemoryForProject,
  getKnowledgeMemoryForOrganization,
  getKnowledgeMemoryForProject,
} from "./knowledge-memory";
import {
  restoreKnowledgeMemoryRevisionForOrganization,
  restoreKnowledgeMemoryRevisionForProject,
} from "./knowledge-memory-revisions";

const fixture = createAuthTestFixture();
const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
  await projectFixture.cleanup();
});

async function createScope() {
  const stored = await fixture.createLocalWorkosIdentity();
  return {
    organizationId: stored.organization.id,
    userId: stored.user.id,
  };
}

describe("knowledge memory version history", () => {
  it("creates versions only when normalized content changes", async () => {
    const scope = await createScope();

    const empty = await commitKnowledgeMemoryForOrganization({
      ...scope,
      updatedByUserId: scope.userId,
      content: "\n\n",
      expectedRevisionId: null,
    });
    expect(isOk(empty) && empty.value.changed).toBe(false);
    expect(await getKnowledgeMemoryForOrganization(scope.organizationId)).toMatchObject({
      revisionId: null,
      version: 0,
      content: "",
    });

    const first = await commitKnowledgeMemoryForOrganization({
      ...scope,
      updatedByUserId: scope.userId,
      content: "Use sentence case.\n\n",
      summary: "Add casing guidance",
      expectedRevisionId: null,
    });
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) {
      return;
    }
    expect(first.value).toMatchObject({
      changed: true,
      knowledgeMemory: {
        version: 1,
        content: "Use sentence case.",
        summary: "Add casing guidance",
      },
    });

    const noOp = await commitKnowledgeMemoryForOrganization({
      ...scope,
      updatedByUserId: scope.userId,
      content: "Use sentence case.\n",
      summary: "This note must not create a version",
      expectedRevisionId: first.value.knowledgeMemory.revisionId,
    });
    expect(isOk(noOp) && noOp.value.changed).toBe(false);

    const second = await commitKnowledgeMemoryForOrganization({
      ...scope,
      updatedByUserId: scope.userId,
      content: "Prefer short button labels.",
      expectedRevisionId: first.value.knowledgeMemory.revisionId,
    });
    expect(isOk(second)).toBe(true);
    if (!isOk(second)) {
      return;
    }
    expect(second.value.knowledgeMemory).toMatchObject({
      version: 2,
      content: "Prefer short button labels.",
      summary: "Updated memory",
    });

    const revisions = await db
      .select({
        id: schema.knowledgeMemoryRevisions.id,
        version: schema.knowledgeMemoryRevisions.version,
        content: schema.knowledgeMemoryRevisions.content,
      })
      .from(schema.knowledgeMemoryRevisions)
      .where(eq(schema.knowledgeMemoryRevisions.organizationId, scope.organizationId));
    expect(revisions).toEqual([
      {
        id: first.value.knowledgeMemory.revisionId,
        version: 1,
        content: "Use sentence case.",
      },
    ]);
  });

  it("allows only one concurrent first commit and one concurrent update", async () => {
    const scope = await createScope();

    const firstRace = await Promise.all([
      commitKnowledgeMemoryForOrganization({
        ...scope,
        updatedByUserId: scope.userId,
        content: "First draft",
        expectedRevisionId: null,
      }),
      commitKnowledgeMemoryForOrganization({
        ...scope,
        updatedByUserId: scope.userId,
        content: "Competing draft",
        expectedRevisionId: null,
      }),
    ]);
    expect(firstRace.filter(isOk)).toHaveLength(1);
    expect(firstRace.filter(isErr)).toHaveLength(1);

    const current = await getKnowledgeMemoryForOrganization(scope.organizationId);
    const updateRace = await Promise.all([
      commitKnowledgeMemoryForOrganization({
        ...scope,
        updatedByUserId: scope.userId,
        content: "Update A",
        expectedRevisionId: current.revisionId,
      }),
      commitKnowledgeMemoryForOrganization({
        ...scope,
        updatedByUserId: scope.userId,
        content: "Update B",
        expectedRevisionId: current.revisionId,
      }),
    ]);
    expect(updateRace.filter(isOk)).toHaveLength(1);
    expect(updateRace.filter(isErr)).toHaveLength(1);

    const winner = await getKnowledgeMemoryForOrganization(scope.organizationId);
    expect(winner.version).toBe(2);
    expect(["Update A", "Update B"]).toContain(winner.content);
  });

  it("rolls back the head update when archiving the previous snapshot fails", async () => {
    const scope = await createScope();
    const first = await commitKnowledgeMemoryForOrganization({
      ...scope,
      updatedByUserId: scope.userId,
      content: "Original",
      expectedRevisionId: null,
    });
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) {
      return;
    }

    await db.insert(schema.knowledgeMemoryRevisions).values({
      id: randomUUID(),
      organizationId: scope.organizationId,
      version: 1,
      content: "Conflicting archive",
      summary: "Test fixture",
      createdByUserId: scope.userId,
      createdAt: new Date(),
    });

    await expect(
      commitKnowledgeMemoryForOrganization({
        ...scope,
        updatedByUserId: scope.userId,
        content: "Must roll back",
        expectedRevisionId: first.value.knowledgeMemory.revisionId,
      }),
    ).rejects.toBeDefined();

    await expect(getKnowledgeMemoryForOrganization(scope.organizationId)).resolves.toMatchObject({
      revisionId: first.value.knowledgeMemory.revisionId,
      version: 1,
      content: "Original",
    });
  });

  it("restores an immutable snapshot as a new head revision", async () => {
    const scope = await createScope();
    const first = await commitKnowledgeMemoryForOrganization({
      ...scope,
      updatedByUserId: scope.userId,
      content: "Version one",
      expectedRevisionId: null,
    });
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) {
      return;
    }

    const second = await commitKnowledgeMemoryForOrganization({
      ...scope,
      updatedByUserId: scope.userId,
      content: "Version two",
      expectedRevisionId: first.value.knowledgeMemory.revisionId,
    });
    expect(isOk(second)).toBe(true);
    if (!isOk(second)) {
      return;
    }

    const restored = await restoreKnowledgeMemoryRevisionForOrganization({
      organizationId: scope.organizationId,
      revisionId: first.value.knowledgeMemory.revisionId!,
      restoredByUserId: scope.userId,
      expectedRevisionId: second.value.knowledgeMemory.revisionId,
    });
    expect(isOk(restored)).toBe(true);
    if (!isOk(restored)) {
      return;
    }

    expect(restored.value.knowledgeMemory).toMatchObject({
      version: 3,
      content: "Version one",
      summary: "Restored version 1",
    });

    const restoredAgain = await restoreKnowledgeMemoryRevisionForOrganization({
      organizationId: scope.organizationId,
      revisionId: first.value.knowledgeMemory.revisionId!,
      restoredByUserId: scope.userId,
      expectedRevisionId: restored.value.knowledgeMemory.revisionId,
    });
    expect(isOk(restoredAgain)).toBe(true);
    if (!isOk(restoredAgain)) {
      return;
    }
    expect(restoredAgain.value.knowledgeMemory).toMatchObject({
      version: 4,
      content: "Version one",
      summary: "Restored version 1",
    });

    const archived = await db
      .select({ version: schema.knowledgeMemoryRevisions.version })
      .from(schema.knowledgeMemoryRevisions)
      .where(
        and(
          eq(schema.knowledgeMemoryRevisions.organizationId, scope.organizationId),
          eq(schema.knowledgeMemoryRevisions.version, 2),
        ),
      );
    expect(archived).toHaveLength(1);
  });
});

describe("project knowledge memory version history", () => {
  it("creates versions only when normalized content changes", async () => {
    const { user, project } = await projectFixture.createStoredProjectFixture();

    const empty = await commitKnowledgeMemoryForProject({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "\n\n",
      expectedRevisionId: null,
    });
    expect(isOk(empty) && empty.value.changed).toBe(false);
    expect(await getKnowledgeMemoryForProject(project.id)).toMatchObject({
      revisionId: null,
      version: 0,
      content: "",
    });

    const first = await commitKnowledgeMemoryForProject({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "Use sentence case.\n\n",
      summary: "Add casing guidance",
      expectedRevisionId: null,
    });
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) {
      return;
    }
    expect(first.value).toMatchObject({
      changed: true,
      knowledgeMemory: {
        version: 1,
        content: "Use sentence case.",
        summary: "Add casing guidance",
      },
    });

    const noOp = await commitKnowledgeMemoryForProject({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "Use sentence case.\n",
      summary: "This note must not create a version",
      expectedRevisionId: first.value.knowledgeMemory.revisionId,
    });
    expect(isOk(noOp) && noOp.value.changed).toBe(false);

    const second = await commitKnowledgeMemoryForProject({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "Prefer short button labels.",
      expectedRevisionId: first.value.knowledgeMemory.revisionId,
    });
    expect(isOk(second)).toBe(true);
    if (!isOk(second)) {
      return;
    }
    expect(second.value.knowledgeMemory).toMatchObject({
      version: 2,
      content: "Prefer short button labels.",
      summary: "Updated memory",
    });

    const revisions = await db
      .select({
        id: schema.projectKnowledgeMemoryRevisions.id,
        version: schema.projectKnowledgeMemoryRevisions.version,
        content: schema.projectKnowledgeMemoryRevisions.content,
      })
      .from(schema.projectKnowledgeMemoryRevisions)
      .where(eq(schema.projectKnowledgeMemoryRevisions.projectId, project.id));
    expect(revisions).toEqual([
      {
        id: first.value.knowledgeMemory.revisionId,
        version: 1,
        content: "Use sentence case.",
      },
    ]);
  });

  it("keeps project and organization memories independent", async () => {
    const { organization, user, project } = await projectFixture.createStoredProjectFixture();

    const organizationCommit = await commitKnowledgeMemoryForOrganization({
      organizationId: organization.id,
      updatedByUserId: user.id,
      content: "Workspace voice is calm.",
      expectedRevisionId: null,
    });
    const projectCommit = await commitKnowledgeMemoryForProject({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "Checkout buttons stay short.",
      expectedRevisionId: null,
    });
    expect(isOk(organizationCommit)).toBe(true);
    expect(isOk(projectCommit)).toBe(true);

    await expect(getKnowledgeMemoryForOrganization(organization.id)).resolves.toMatchObject({
      content: "Workspace voice is calm.",
    });
    await expect(getKnowledgeMemoryForProject(project.id)).resolves.toMatchObject({
      content: "Checkout buttons stay short.",
    });
  });

  it("restores an immutable project snapshot as a new head revision", async () => {
    const { user, project } = await projectFixture.createStoredProjectFixture();
    const first = await commitKnowledgeMemoryForProject({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "Version one",
      expectedRevisionId: null,
    });
    expect(isOk(first)).toBe(true);
    if (!isOk(first)) {
      return;
    }

    const second = await commitKnowledgeMemoryForProject({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "Version two",
      expectedRevisionId: first.value.knowledgeMemory.revisionId,
    });
    expect(isOk(second)).toBe(true);
    if (!isOk(second)) {
      return;
    }

    const restored = await restoreKnowledgeMemoryRevisionForProject({
      projectId: project.id,
      revisionId: first.value.knowledgeMemory.revisionId!,
      restoredByUserId: user.id,
      expectedRevisionId: second.value.knowledgeMemory.revisionId,
    });
    expect(isOk(restored)).toBe(true);
    if (!isOk(restored)) {
      return;
    }

    expect(restored.value.knowledgeMemory).toMatchObject({
      version: 3,
      content: "Version one",
      summary: "Restored version 1",
    });
  });
});
