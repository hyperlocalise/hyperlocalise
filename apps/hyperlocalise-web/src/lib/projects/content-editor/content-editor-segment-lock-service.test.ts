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
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import {
  attachCatSegmentLocks,
  isCatSegmentLocked,
  listLockedCatSegmentIds,
  setCatSegmentLocks,
} from "@/lib/projects/content-editor/content-editor-segment-lock-service";

describe("CAT segment lock service", () => {
  const projectFixture = createProjectTestFixture();

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await projectFixture.cleanup();
  });

  it("locks and unlocks native project segments for a target locale", async () => {
    const { organization, user, project } = await projectFixture.createStoredProjectFixture();

    const locked = await setCatSegmentLocks({
      organizationId: organization.id,
      projectId: project.id,
      targetLocale: "fr-FR",
      externalStringIds: ["key-1", "key-2"],
      isLocked: true,
      actorUserId: user.id,
    });
    expect(locked).toEqual({ updatedCount: 2, isLocked: true });

    const lockedIds = await listLockedCatSegmentIds({
      organizationId: organization.id,
      projectId: project.id,
      targetLocale: "fr-FR",
      externalStringIds: ["key-1", "key-2", "key-3"],
    });
    expect([...lockedIds].toSorted()).toEqual(["key-1", "key-2"]);
    expect(
      await isCatSegmentLocked({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: "fr-FR",
        externalStringId: "key-1",
      }),
    ).toBe(true);
    expect(
      await isCatSegmentLocked({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: "de-DE",
        externalStringId: "key-1",
      }),
    ).toBe(false);

    const unlocked = await setCatSegmentLocks({
      organizationId: organization.id,
      projectId: project.id,
      targetLocale: "fr-FR",
      externalStringIds: ["key-1"],
      isLocked: false,
      actorUserId: user.id,
    });
    expect(unlocked).toEqual({ updatedCount: 1, isLocked: false });
    expect(
      await isCatSegmentLocked({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: "fr-FR",
        externalStringId: "key-1",
      }),
    ).toBe(false);
    expect(
      await isCatSegmentLocked({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: "fr-FR",
        externalStringId: "key-2",
      }),
    ).toBe(true);

    await db
      .delete(schema.projectContentEditorSegmentLocks)
      .where(eq(schema.projectContentEditorSegmentLocks.organizationId, organization.id));
  });

  it("locks TMS segments by API project id without touching provider hide state", async () => {
    const { organization, user } = await projectFixture.createStoredProjectFixture();
    const projectId = "ext:crowdin:42";

    const locked = await setCatSegmentLocks({
      organizationId: organization.id,
      projectId,
      targetLocale: "ja-JP",
      externalStringIds: ["1001"],
      isLocked: true,
      actorUserId: user.id,
    });
    expect(locked).toEqual({ updatedCount: 1, isLocked: true });

    const queue = await attachCatSegmentLocks({
      organizationId: organization.id,
      projectId,
      contentEditorQueue: {
        targetLocale: "ja-JP",
        segments: [{ externalStringId: "1001" }, { externalStringId: "1002" }],
      },
    });
    expect(queue.segments).toEqual([
      { externalStringId: "1001", isLocked: true },
      { externalStringId: "1002" },
    ]);

    await db
      .delete(schema.projectContentEditorSegmentLocks)
      .where(eq(schema.projectContentEditorSegmentLocks.organizationId, organization.id));
  });

  it("ignores blank ids, dedupes, and is idempotent on re-lock and unlock-miss", async () => {
    const { organization, user, project } = await projectFixture.createStoredProjectFixture();

    expect(
      await setCatSegmentLocks({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: "fr-FR",
        externalStringIds: ["", "  ", "\t"],
        isLocked: true,
        actorUserId: user.id,
      }),
    ).toEqual({ updatedCount: 0, isLocked: true });

    const first = await setCatSegmentLocks({
      organizationId: organization.id,
      projectId: project.id,
      targetLocale: "fr-FR",
      externalStringIds: [" key-a ", "key-a", "key-b"],
      isLocked: true,
      actorUserId: user.id,
    });
    expect(first).toEqual({ updatedCount: 2, isLocked: true });

    const relock = await setCatSegmentLocks({
      organizationId: organization.id,
      projectId: project.id,
      targetLocale: "fr-FR",
      externalStringIds: ["key-a"],
      isLocked: true,
      actorUserId: user.id,
    });
    expect(relock).toEqual({ updatedCount: 1, isLocked: true });
    expect(
      await isCatSegmentLocked({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: "fr-FR",
        externalStringId: "key-a",
      }),
    ).toBe(true);

    expect(
      await setCatSegmentLocks({
        organizationId: organization.id,
        projectId: project.id,
        targetLocale: "fr-FR",
        externalStringIds: ["never-locked"],
        isLocked: false,
        actorUserId: user.id,
      }),
    ).toEqual({ updatedCount: 0, isLocked: false });

    await db
      .delete(schema.projectContentEditorSegmentLocks)
      .where(eq(schema.projectContentEditorSegmentLocks.organizationId, organization.id));
  });

  it("does not leak locks across projects sharing the same external string id", async () => {
    const { organization, user } = await projectFixture.createStoredProjectFixture();
    const projectA = "project_a";
    const projectB = "project_b";

    await setCatSegmentLocks({
      organizationId: organization.id,
      projectId: projectA,
      targetLocale: "fr-FR",
      externalStringIds: ["shared-key"],
      isLocked: true,
      actorUserId: user.id,
    });

    expect(
      await isCatSegmentLocked({
        organizationId: organization.id,
        projectId: projectA,
        targetLocale: "fr-FR",
        externalStringId: "shared-key",
      }),
    ).toBe(true);
    expect(
      await isCatSegmentLocked({
        organizationId: organization.id,
        projectId: projectB,
        targetLocale: "fr-FR",
        externalStringId: "shared-key",
      }),
    ).toBe(false);

    await db
      .delete(schema.projectContentEditorSegmentLocks)
      .where(eq(schema.projectContentEditorSegmentLocks.organizationId, organization.id));
  });
});
