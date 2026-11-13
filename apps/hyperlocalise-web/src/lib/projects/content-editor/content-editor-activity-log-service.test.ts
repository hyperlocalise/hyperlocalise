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

import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

import { listContentEditorActivityLogs } from "./content-editor-activity-log-service";

const projectFixture = createProjectTestFixture();
const PROJECT_ID = "ext:crowdin:42";
const SOURCE_PATH = "crowdin/home.json";

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function insertEvent(input: {
  organizationId: string;
  actorUserId: string | null;
  segmentId: string;
  eventType?:
    | "string_segment_translation_updated"
    | "string_segment_approved"
    | "string_segment_hidden"
    | "string_segment_locked";
  targetLocale?: string;
  sourcePath?: string;
  projectId?: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
}) {
  const [event] = await db
    .insert(schema.organizationActivityEvents)
    .values({
      organizationId: input.organizationId,
      actorKind: input.actorUserId ? "user" : "system",
      actorUserId: input.actorUserId,
      eventType: input.eventType ?? "string_segment_translation_updated",
      targetKind: "string_segment",
      targetId: input.segmentId,
      payload: {
        projectId: input.projectId ?? PROJECT_ID,
        sourcePath: input.sourcePath ?? SOURCE_PATH,
        fileName: "home.json",
        segmentId: input.segmentId,
        targetLocale: input.targetLocale ?? "fr",
        ...input.payload,
      },
      ...(input.createdAt ? { createdAt: sql`${input.createdAt}::timestamptz` } : {}),
    })
    .returning({ id: schema.organizationActivityEvents.id });
  return event.id;
}

describe("listContentEditorActivityLogs", () => {
  it("lists one connected TMS segment's activity in one locale, newest first", async () => {
    const { organization, user } = await projectFixture.createStoredProjectFixture();
    const older = await insertEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      segmentId: "1001",
      createdAt: "2026-10-01T00:00:00Z",
    });
    const newer = await insertEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      segmentId: "1001",
      eventType: "string_segment_approved",
      createdAt: "2026-10-02T00:00:00Z",
    });
    await insertEvent({ organizationId: organization.id, actorUserId: null, segmentId: "1002" });
    await insertEvent({
      organizationId: organization.id,
      actorUserId: null,
      segmentId: "1001",
      targetLocale: "de",
    });
    await insertEvent({
      organizationId: organization.id,
      actorUserId: null,
      segmentId: "1001",
      projectId: "ext:crowdin:43",
    });

    const result = await listContentEditorActivityLogs({
      organizationId: organization.id,
      projectId: PROJECT_ID,
      sourcePath: SOURCE_PATH,
      segmentId: "1001",
      targetLocale: "fr",
      limit: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.activityLogs.map((item) => item.id)).toEqual([newer, older]);
    expect(result.activityLogs[0]).toMatchObject({
      eventType: "string_segment_approved",
      actor: { kind: "user", userId: user.id },
      target: { kind: "string_segment", id: "1001", displayName: "home.json" },
    });
    expect(result.nextCursor).toBeNull();
  });

  it("returns a bulk hide or lock to every segment it affected", async () => {
    const { organization } = await projectFixture.createStoredProjectFixture();
    const hidden = await insertEvent({
      organizationId: organization.id,
      actorUserId: null,
      segmentId: "1001",
      eventType: "string_segment_hidden",
      payload: { segmentIds: ["1001", "1002"], itemCount: 2 },
    });
    await insertEvent({
      organizationId: organization.id,
      actorUserId: null,
      segmentId: "1009",
      eventType: "string_segment_locked",
      payload: { segmentIds: ["1009", "1010"], itemCount: 2 },
    });

    const hiddenForSecond = await listContentEditorActivityLogs({
      organizationId: organization.id,
      projectId: PROJECT_ID,
      sourcePath: SOURCE_PATH,
      segmentId: "1002",
      limit: 50,
    });
    const lockedForSecond = await listContentEditorActivityLogs({
      organizationId: organization.id,
      projectId: PROJECT_ID,
      sourcePath: SOURCE_PATH,
      segmentId: "1010",
      targetLocale: "fr",
      limit: 50,
    });
    const unrelated = await listContentEditorActivityLogs({
      organizationId: organization.id,
      projectId: PROJECT_ID,
      sourcePath: SOURCE_PATH,
      segmentId: "1003",
      limit: 50,
    });

    expect(hiddenForSecond.ok && hiddenForSecond.activityLogs.map((item) => item.id)).toEqual([
      hidden,
    ]);
    expect(
      lockedForSecond.ok && lockedForSecond.activityLogs.map((item) => item.eventType),
    ).toEqual(["string_segment_locked"]);
    expect(unrelated.ok && unrelated.activityLogs).toEqual([]);
  });

  it("pages through events that share a millisecond without skipping any", async () => {
    const { organization } = await projectFixture.createStoredProjectFixture();
    const ids = [];
    for (const createdAt of [
      "2026-10-01T00:00:00.123100Z",
      "2026-10-01T00:00:00.123200Z",
      "2026-10-01T00:00:00.123300Z",
    ]) {
      ids.push(
        await insertEvent({
          organizationId: organization.id,
          actorUserId: null,
          segmentId: "1001",
          createdAt,
        }),
      );
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listContentEditorActivityLogs({
        organizationId: organization.id,
        projectId: PROJECT_ID,
        sourcePath: SOURCE_PATH,
        segmentId: "1001",
        cursor,
        limit: 1,
      });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      seen.push(...page.activityLogs.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toEqual(ids.toReversed());
  });

  it("rejects a malformed cursor", async () => {
    const { organization } = await projectFixture.createStoredProjectFixture();

    const result = await listContentEditorActivityLogs({
      organizationId: organization.id,
      projectId: PROJECT_ID,
      sourcePath: SOURCE_PATH,
      cursor: Buffer.from(JSON.stringify({ createdAt: "now()", id: "x" })).toString("base64url"),
      limit: 50,
    });

    expect(result).toEqual({ ok: false, error: "invalid_activity_log_cursor" });
  });
});
