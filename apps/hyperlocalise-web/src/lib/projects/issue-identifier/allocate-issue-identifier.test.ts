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
import { afterAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import {
  allocateNextIssueIdentifier,
  allocateUniqueProjectIdentifier,
  insertWithAllocatedProjectIdentifier,
  isProjectIdentifierTaken,
  listTakenProjectIdentifiers,
} from "@/lib/projects/issue-identifier/allocate-issue-identifier";
import { formatIssueId } from "@/lib/projects/issue-identifier/project-issue-identifier";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

describe("allocate-issue-identifier", () => {
  const fixture = createProjectTestFixture();

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("allocates past the max existing issue number when seq is behind", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();

    await db
      .update(schema.projects)
      .set({ issueNumberSeq: 0 })
      .where(eq(schema.projects.id, project.id));

    const highNumber = 9_001_337;
    await db.insert(schema.issueSheetIssues).values({
      organizationId: organization.id,
      projectId: project.id,
      number: highNumber,
      identifier: formatIssueId(project.identifier, highNumber),
      title: "Legacy placeholder",
    });

    const allocated = await allocateNextIssueIdentifier({ projectId: project.id });

    expect(allocated.number).toBe(highNumber + 1);
    expect(allocated.identifier).toBe(formatIssueId(project.identifier, highNumber + 1));
    expect(allocated.projectIdentifier).toBe(project.identifier);
  });

  it("treats historical issue identifier prefixes as taken", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    const historicalPrefix = uniqueTestProjectIdentifier("hist");
    const renamedPrefix = uniqueTestProjectIdentifier("renamed");

    await db
      .update(schema.projects)
      .set({ identifier: renamedPrefix })
      .where(eq(schema.projects.id, project.id));

    await db.insert(schema.issueSheetIssues).values({
      organizationId: organization.id,
      projectId: project.id,
      number: 1,
      identifier: formatIssueId(historicalPrefix, 1),
      title: "Keeps old prefix",
    });

    const taken = await listTakenProjectIdentifiers();
    expect(taken.has(historicalPrefix)).toBe(true);
    expect(taken.has(renamedPrefix)).toBe(true);

    expect(
      await isProjectIdentifierTaken({
        identifier: historicalPrefix,
        excludeProjectId: project.id,
      }),
    ).toBe(false);

    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [otherProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier("other"),
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Other",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    expect(
      await isProjectIdentifierTaken({
        identifier: historicalPrefix,
        excludeProjectId: otherProject.id,
      }),
    ).toBe(true);

    const allocated = await allocateUniqueProjectIdentifier({
      name: "Should Avoid Historical",
      preferred: historicalPrefix,
    });
    expect(allocated).not.toBe(historicalPrefix);
  });

  it("probes the next suffix when the derived prefix is already inserted", async () => {
    const { organization, user } = await fixture.createStoredProjectFixture();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const first = await allocateUniqueProjectIdentifier({ name: "Website Lab" });

    await db.insert(schema.projects).values({
      id: `project_${randomUUID()}`,
      identifier: first,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Website Lab",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });

    const second = await allocateUniqueProjectIdentifier({ name: "Website Lab" });
    expect(second).not.toBe(first);
  });

  it("retries insert when two creates race on projects_identifier_key", async () => {
    let attempts = 0;
    const identifier = await insertWithAllocatedProjectIdentifier({
      name: "Retry Lab",
      insert: async (nextIdentifier) => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("duplicate key"), {
            constraint: "projects_identifier_key",
          });
        }
        return nextIdentifier;
      },
    });

    expect(attempts).toBe(2);
    expect(identifier).toMatch(/^[A-Z][A-Z0-9]{0,9}$/);
  });
});
