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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectFileCatComment } from "@/api/routes/project/project.schema";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import {
  projectTranslationService,
  upsertProjectTranslationKeysFromEntries,
} from "@/lib/projects/translations/project-translation-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { NativeCatCommentService } from "./native-cat-comment-service";
import {
  maybeCreateIssueSheetFromNativeCatIssueComment,
  maybeResolveIssueSheetFromNativeCatIssueComment,
} from "./native-cat-issue-sheet";

const authFixture = createAuthTestFixture();

function makeIssueComment(overrides: Partial<ProjectFileCatComment> = {}): ProjectFileCatComment {
  return {
    externalCommentId: randomUUID(),
    type: "issue",
    status: "unresolved",
    text: "Wrong tone in CTA",
    createdAt: new Date().toISOString(),
    locale: "fr-FR",
    author: "Translator",
    ...overrides,
  };
}

describe("maybeCreateIssueSheetFromNativeCatIssueComment", () => {
  const createIssue = vi.fn();
  const issueSheetService = { createIssue } as unknown as IssueSheetService;

  beforeEach(() => {
    createIssue.mockReset();
    createIssue.mockResolvedValue({ id: "issue_1" });
  });

  it("skips when Issues are disabled or the comment is not an issue", async () => {
    await maybeCreateIssueSheetFromNativeCatIssueComment({
      organizationId: "org_1",
      organizationSlug: "acme",
      projectId: "project_1",
      actorUserId: "user_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr-FR",
      translationKeyId: randomUUID(),
      comment: makeIssueComment(),
      issuesEnabled: false,
      issueSheetService,
    });

    await maybeCreateIssueSheetFromNativeCatIssueComment({
      organizationId: "org_1",
      organizationSlug: "acme",
      projectId: "project_1",
      actorUserId: "user_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr-FR",
      translationKeyId: randomUUID(),
      comment: makeIssueComment({ type: "comment" }),
      issuesEnabled: true,
      issueSheetService,
    });

    expect(createIssue).not.toHaveBeenCalled();
  });

  it("maps invalid issue types to general_question and truncates long titles", async () => {
    const translationKeyId = randomUUID();
    const longText = `${"x".repeat(320)} trailing`;

    await maybeCreateIssueSheetFromNativeCatIssueComment({
      organizationId: "org_1",
      organizationSlug: "acme",
      projectId: "project_1",
      actorUserId: "user_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr-FR",
      translationKeyId,
      issueType: "not_a_real_type",
      comment: makeIssueComment({ text: longText }),
      issuesEnabled: true,
      issueSheetService,
    });

    expect(createIssue).toHaveBeenCalledTimes(1);
    const body = createIssue.mock.calls[0]?.[0]?.body;
    expect(body.issueType).toBe("general_question");
    expect(body.title).toHaveLength(300);
    expect(body.title.endsWith("…")).toBe(true);
    expect(body.translationKeyId).toBe(translationKeyId);
    expect(body.linkKind).toBe("cat_segment");
  });

  it("uses a CAT issue fallback title for whitespace-only text and encodes link params", async () => {
    const translationKeyId = randomUUID();
    const sourcePath = "locales/path with spaces/en.json";
    const segmentId = translationKeyId;

    await maybeCreateIssueSheetFromNativeCatIssueComment({
      organizationId: "org_1",
      organizationSlug: "acme",
      projectId: "project/with/slashes",
      actorUserId: "user_1",
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId,
      issueType: "translation_mistake",
      comment: makeIssueComment({ text: "   \n\t  ", externalCommentId: "comment-1" }),
      issuesEnabled: true,
      issueSheetService,
    });

    const body = createIssue.mock.calls[0]?.[0]?.body;
    expect(body.title).toBe("CAT issue");
    expect(body.issueType).toBe("translation_mistake");
    expect(body.linkUrl).toContain(
      `/org/acme/projects/${encodeURIComponent("project/with/slashes")}/files/cat?`,
    );
    expect(body.linkUrl).toContain(`sourcePath=${encodeURIComponent(sourcePath)}`);
    expect(body.linkUrl).toContain(`segment=${encodeURIComponent(segmentId)}`);
    expect(body.linkedCommentId).toBe("comment-1");
  });

  it("swallows createIssue failures so the CAT comment path still succeeds", async () => {
    createIssue.mockRejectedValue(new Error("db down"));

    await expect(
      maybeCreateIssueSheetFromNativeCatIssueComment({
        organizationId: "org_1",
        organizationSlug: "acme",
        projectId: "project_1",
        actorUserId: "user_1",
        sourcePath: "locales/en.json",
        targetLocale: "fr-FR",
        translationKeyId: randomUUID(),
        comment: makeIssueComment(),
        issuesEnabled: true,
        issueSheetService,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("maybeResolveIssueSheetFromNativeCatIssueComment", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await authFixture.cleanup();
  });

  it("resolves open and in-progress linked Issues and leaves closed statuses alone", async () => {
    const { organization, user: actor } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: actor.id,
        name: "CAT Issues",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });
    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "cta", text: "Start", context: null }],
    });
    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);

    const commentService = new NativeCatCommentService(db, projectTranslationService);
    const posted = await commentService.save({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId: translationKey!.id,
      text: "Fix CTA",
      type: "issue",
      issueType: "translation_mistake",
      actorUserId: actor.id,
    });
    expect(posted).not.toBeNull();

    const issueSheetService = new IssueSheetService();
    const openIssue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Open linked",
        linkedCommentId: posted!.externalCommentId,
        status: "open",
      },
    });
    const inProgressIssue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "In progress linked",
        linkedCommentId: posted!.externalCommentId,
        status: "in_progress",
      },
    });
    const resolvedIssue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Already resolved",
        linkedCommentId: posted!.externalCommentId,
        status: "resolved",
      },
    });
    const wontFixIssue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Wont fix",
        linkedCommentId: posted!.externalCommentId,
        status: "wont_fix",
      },
    });

    await maybeResolveIssueSheetFromNativeCatIssueComment({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      linkedCommentId: posted!.externalCommentId,
    });

    const statuses = await db
      .select({
        id: schema.issueSheetIssues.id,
        status: schema.issueSheetIssues.status,
      })
      .from(schema.issueSheetIssues)
      .where(eq(schema.issueSheetIssues.projectId, project.id));

    const byId = new Map(statuses.map((row) => [row.id, row.status]));
    expect(byId.get(openIssue.id)).toBe("resolved");
    expect(byId.get(inProgressIssue.id)).toBe("resolved");
    expect(byId.get(resolvedIssue.id)).toBe("resolved");
    expect(byId.get(wontFixIssue.id)).toBe("wont_fix");
  });

  it("swallows per-issue update failures while continuing other linked rows", async () => {
    const { organization, user: actor } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: actor.id,
        name: "CAT Issues Fail Soft",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const sourcePath = "locales/en.json";
    const sourceFile = await ensureRepositorySourceFile({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
    });
    await upsertProjectTranslationKeysFromEntries({
      organizationId: organization.id,
      projectId: project.id,
      repositorySourceFileId: sourceFile.id,
      entries: [{ key: "cta", text: "Start", context: null }],
    });
    const [translationKey] = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id))
      .limit(1);

    const commentService = new NativeCatCommentService(db, projectTranslationService);
    const posted = await commentService.save({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath,
      targetLocale: "fr-FR",
      translationKeyId: translationKey!.id,
      text: "Fix CTA",
      type: "issue",
      issueType: "translation_mistake",
      actorUserId: actor.id,
    });

    const first = await new IssueSheetService().createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "First",
        linkedCommentId: posted!.externalCommentId,
        status: "open",
      },
    });
    const second = await new IssueSheetService().createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Second",
        linkedCommentId: posted!.externalCommentId,
        status: "open",
      },
    });

    const updateIssue = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ id: second.id, status: "resolved" });
    const issueSheetService = { updateIssue } as unknown as IssueSheetService;

    await expect(
      maybeResolveIssueSheetFromNativeCatIssueComment({
        organizationId: organization.id,
        projectId: project.id,
        actorUserId: actor.id,
        linkedCommentId: posted!.externalCommentId,
        issueSheetService,
      }),
    ).resolves.toBeUndefined();

    expect(updateIssue).toHaveBeenCalledTimes(2);
    expect(updateIssue.mock.calls.map((call) => call[0].issueId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });
});
