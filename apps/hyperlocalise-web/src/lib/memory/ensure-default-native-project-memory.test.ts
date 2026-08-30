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

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import {
  defaultNativeProjectMemoryName,
  ensureDefaultNativeProjectMemory,
  ensureDefaultNativeProjectMemoryForProject,
  listAttachedProjectMemoryIds,
} from "./ensure-default-native-project-memory";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("defaultNativeProjectMemoryName", () => {
  it("uses the project name and falls back when blank", () => {
    expect(defaultNativeProjectMemoryName("Marketing Site")).toBe("Marketing Site");
    expect(defaultNativeProjectMemoryName("   ")).toBe("Translation memory");
    expect(defaultNativeProjectMemoryName("a".repeat(250))).toHaveLength(200);
  });
});

describe("ensureDefaultNativeProjectMemory", () => {
  it("creates and attaches a default memory for a native project with none", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();

    const memoryIds = await ensureDefaultNativeProjectMemory({
      organizationId: organization.id,
      projectId: project.id,
      projectName: project.name,
      createdByUserId: user.id,
    });

    expect(memoryIds).toHaveLength(1);
    expect(await listAttachedProjectMemoryIds(project.id)).toEqual(memoryIds);

    const [memory] = await db
      .select({ name: schema.memories.name, source: schema.memories.source })
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryIds[0]!));

    expect(memory).toMatchObject({
      name: "Docs",
      source: "native",
    });
  });

  it("returns existing attachments without creating another memory", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();

    const first = await ensureDefaultNativeProjectMemory({
      organizationId: organization.id,
      projectId: project.id,
      projectName: project.name,
      createdByUserId: user.id,
    });
    const second = await ensureDefaultNativeProjectMemory({
      organizationId: organization.id,
      projectId: project.id,
      projectName: project.name,
      createdByUserId: user.id,
    });

    expect(second).toEqual(first);

    const memories = await db
      .select({ id: schema.memories.id })
      .from(schema.memories)
      .where(eq(schema.memories.organizationId, organization.id));
    expect(memories).toHaveLength(1);
  });

  it("does not create a native memory for an external TMS project", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Crowdin Project",
        description: "",
        translationContext: "",
        source: "external_tms",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const memoryIds = await ensureDefaultNativeProjectMemoryForProject(project.id);

    expect(memoryIds).toEqual([]);
    expect(await listAttachedProjectMemoryIds(project.id)).toEqual([]);
  });
});
