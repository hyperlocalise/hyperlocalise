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
import { db, schema } from "@/lib/database";
import { IssueSheetCommentService } from "@/lib/projects/issue-sheet/issue-sheet-comment-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

const authFixture = createAuthTestFixture();
const commentService = new IssueSheetCommentService();
const issueSheetService = new IssueSheetService();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

describe("IssueSheetService.listFeed", () => {
  it("interleaves activities and root comments and nests replies", async () => {
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();
    await authFixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext!;
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Feed Service Project",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      body: {
        title: "Feed service issue",
        issueType: "general_question",
      },
    });

    const root = await commentService.create({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Root" },
    });
    expect(root.ok).toBe(true);
    if (!root.ok) {
      throw new Error("failed to create root comment");
    }

    const reply = await commentService.create({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Reply", parentId: root.value.id },
    });
    expect(reply.ok).toBe(true);

    await issueSheetService.updateIssue({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      body: { status: "resolved" },
    });

    const feed = await issueSheetService.listFeed({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      limit: 10,
    });

    expect(feed.total).toBe(3);
    expect(feed.items.map((item) => item.kind)).toEqual(["activity", "comment_thread", "activity"]);
    expect(feed.items[0]).toMatchObject({
      kind: "activity",
      activity: { type: "issue_created" },
    });
    expect(feed.items[1]).toMatchObject({
      kind: "comment_thread",
      root: { id: root.value.id, body: "Root" },
    });
    if (feed.items[1]?.kind === "comment_thread") {
      expect(feed.items[1].replies.map((item) => item.body)).toEqual(["Reply"]);
    }
    expect(feed.items[2]).toMatchObject({
      kind: "activity",
      activity: { type: "status_changed", previousStatus: "open", nextStatus: "resolved" },
    });
    const creation = feed.items[0];
    const commentThread = feed.items[1];
    const statusChange = feed.items[2];
    if (
      creation?.kind !== "activity" ||
      commentThread?.kind !== "comment_thread" ||
      statusChange?.kind !== "activity"
    ) {
      throw new Error("expected activity, comment thread, and activity feed ordering");
    }
    expect(new Date(creation.activity.createdAt).getTime()).toBeLessThan(
      new Date(commentThread.root.createdAt).getTime(),
    );
    expect(new Date(commentThread.root.createdAt).getTime()).toBeLessThan(
      new Date(statusChange.activity.createdAt).getTime(),
    );

    const firstPage = await issueSheetService.listFeed({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await issueSheetService.listFeed({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      limit: 10,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items.map((item) => item.kind)).toEqual(["comment_thread", "activity"]);
    expect(secondPage.nextCursor).toBeNull();

    const feedByIdentifier = await issueSheetService.listFeed({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.identifier,
      actorUserId: user.id,
      role: "admin",
      limit: 10,
    });
    expect(feedByIdentifier.total).toBe(feed.total);
    expect(feedByIdentifier.items.map((item) => item.kind)).toEqual(
      feed.items.map((item) => item.kind),
    );
  });
});
