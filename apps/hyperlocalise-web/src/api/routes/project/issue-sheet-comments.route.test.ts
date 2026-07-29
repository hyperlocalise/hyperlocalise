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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { eq } from "drizzle-orm";

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

const projectFixture = createProjectTestFixture();

type IssueComment = {
  id: string;
  body: string;
  parentId: string | null;
  path: string;
  depth: number;
  canEdit: boolean;
  canDelete: boolean;
  author: { userId: string; displayName: string } | null;
};

type CommentListResponse = {
  issueComments: IssueComment[];
  total: number;
  nextCursor: string | null;
};

type CommentResponse = {
  issueComment: IssueComment;
};

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  workspaceIssuesFlagRunMock.mockResolvedValue(true);
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

function commentsUrl(organizationSlug: string, projectId: string, issueId: string, suffix = "") {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet/${encodeURIComponent(issueId)}/comments${suffix}`;
}

async function requestJson(
  url: string,
  input: {
    method?: string;
    headers: HeadersInit;
    body?: unknown;
    query?: Record<string, string>;
  },
) {
  const query = input.query ? `?${new URLSearchParams(input.query).toString()}` : "";
  return app.request(`${url}${query}`, {
    method: input.method ?? "GET",
    headers: {
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      ...Object.fromEntries(new Headers(input.headers).entries()),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
}

async function createIssue(organizationSlug: string, projectId: string, headers: HeadersInit) {
  const response = await requestJson(
    `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet`,
    {
      method: "POST",
      headers,
      body: {
        title: "Discussion issue",
        description: "Needs a comment thread",
        issueType: "general_question",
      },
    },
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { issue: { id: string } };
  return body.issue.id;
}

describe("Issue sheet comment routes", () => {
  it("denies comment access when the feature flag is disabled", async () => {
    workspaceIssuesFlagRunMock.mockResolvedValue(false);
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await requestJson(
      commentsUrl(organizationSlug, project.id, "00000000-0000-4000-8000-000000000000"),
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "feature_unavailable",
    });
  });

  it("creates, lists, updates, replies, and deletes comments", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const issueId = await createIssue(organizationSlug, project.id, headers);

    const createResponse = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      method: "POST",
      headers,
      body: { body: "Root comment" },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as CommentResponse;
    expect(created.issueComment).toMatchObject({
      body: "Root comment",
      parentId: null,
      depth: 0,
      canEdit: true,
      canDelete: true,
    });
    expect(created.issueComment.path).toMatch(new RegExp(`^\\d{20}_${created.issueComment.id}$`));

    const replyResponse = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      method: "POST",
      headers,
      body: { body: "Reply comment", parentId: created.issueComment.id },
    });
    expect(replyResponse.status).toBe(201);
    const reply = (await replyResponse.json()) as CommentResponse;
    expect(reply.issueComment).toMatchObject({
      body: "Reply comment",
      parentId: created.issueComment.id,
      depth: 1,
    });
    expect(reply.issueComment.path).toBe(
      `${created.issueComment.path}.${reply.issueComment.path.split(".").at(-1)}`,
    );
    expect(reply.issueComment.path.startsWith(`${created.issueComment.path}.`)).toBe(true);
    expect(reply.issueComment.path.endsWith(`_${reply.issueComment.id}`)).toBe(true);

    const listResponse = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers,
      query: { sort: "thread" },
    });
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as CommentListResponse;
    expect(listBody.total).toBe(2);
    expect(listBody.issueComments.map((comment) => comment.body)).toEqual([
      "Root comment",
      "Reply comment",
    ]);

    const patchResponse = await requestJson(
      commentsUrl(organizationSlug, project.id, issueId, `/${created.issueComment.id}`),
      {
        method: "PATCH",
        headers,
        body: { body: "Edited root" },
      },
    );
    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as CommentResponse;
    expect(patched.issueComment.body).toBe("Edited root");

    const deleteResponse = await requestJson(
      commentsUrl(organizationSlug, project.id, issueId, `/${created.issueComment.id}`),
      {
        method: "DELETE",
        headers,
      },
    );
    expect(deleteResponse.status).toBe(204);

    const afterDelete = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers,
    });
    const afterDeleteBody = (await afterDelete.json()) as CommentListResponse;
    expect(afterDeleteBody.total).toBe(0);
  });

  it("forbids non-authors from editing or deleting comments", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const authorHeaders = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const issueId = await createIssue(organizationSlug, project.id, authorHeaders);

    const createResponse = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      method: "POST",
      headers: authorHeaders,
      body: { body: "Author only" },
    });
    const created = (await createResponse.json()) as CommentResponse;

    const member = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    const memberHeaders = await projectFixture.authHeadersFor(member);
    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: await projectFixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const patchResponse = await requestJson(
      commentsUrl(organizationSlug, project.id, issueId, `/${created.issueComment.id}`),
      {
        method: "PATCH",
        headers: memberHeaders,
        body: { body: "Hijacked" },
      },
    );
    expect(patchResponse.status).toBe(403);
    await expect(patchResponse.json()).resolves.toMatchObject({ error: "forbidden" });

    const deleteResponse = await requestJson(
      commentsUrl(organizationSlug, project.id, issueId, `/${created.issueComment.id}`),
      {
        method: "DELETE",
        headers: memberHeaders,
      },
    );
    expect(deleteResponse.status).toBe(403);
  });

  it("allows organization admins to edit and delete others comments", async () => {
    const { identity: adminIdentity, project } = await projectFixture.createStoredProjectFixture();
    const author = projectFixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "translator",
    );
    const authorHeaders = await projectFixture.authHeadersFor(author);
    const adminHeaders = await projectFixture.authHeadersFor(adminIdentity);
    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: await projectFixture.getLocalUserId(author.user.workosUserId),
      role: "member",
    });
    const organizationSlug = adminIdentity.organization.slug ?? "missing-slug";
    const issueId = await createIssue(organizationSlug, project.id, adminHeaders);

    const createResponse = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      method: "POST",
      headers: authorHeaders,
      body: { body: "Member comment" },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as CommentResponse;

    const patchResponse = await requestJson(
      commentsUrl(organizationSlug, project.id, issueId, `/${created.issueComment.id}`),
      {
        method: "PATCH",
        headers: adminHeaders,
        body: { body: "Admin edit" },
      },
    );
    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as CommentResponse;
    expect(patched.issueComment.body).toBe("Admin edit");

    const deleteResponse = await requestJson(
      commentsUrl(organizationSlug, project.id, issueId, `/${created.issueComment.id}`),
      {
        method: "DELETE",
        headers: adminHeaders,
      },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("paginates comments with offset and cursor", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const issueId = await createIssue(organizationSlug, project.id, headers);

    for (const body of ["One", "Two", "Three"]) {
      const response = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
        method: "POST",
        headers,
        body: { body },
      });
      expect(response.status).toBe(201);
    }

    const pageOne = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers,
      query: { sort: "created_at", limit: "2", offset: "0" },
    });
    expect(pageOne.status).toBe(200);
    const pageOneBody = (await pageOne.json()) as CommentListResponse;
    expect(pageOneBody.issueComments).toHaveLength(2);
    expect(pageOneBody.total).toBe(3);

    const pageTwo = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers,
      query: { sort: "created_at", limit: "2", offset: "2" },
    });
    const pageTwoBody = (await pageTwo.json()) as CommentListResponse;
    expect(pageTwoBody.issueComments).toHaveLength(1);
    expect(
      new Set(
        [...pageOneBody.issueComments, ...pageTwoBody.issueComments].map((comment) => comment.id),
      ).size,
    ).toBe(3);

    const cursorPage = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers,
      query: { sort: "thread", limit: "2" },
    });
    const cursorBody = (await cursorPage.json()) as CommentListResponse;
    expect(cursorBody.issueComments).toHaveLength(2);
    expect(cursorBody.nextCursor).toBeTruthy();

    const cursorPageTwo = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers,
      query: {
        sort: "thread",
        limit: "2",
        cursor: cursorBody.nextCursor!,
      },
    });
    const cursorPageTwoBody = (await cursorPageTwo.json()) as CommentListResponse;
    expect(cursorPageTwoBody.issueComments).toHaveLength(1);
    expect(
      new Set(
        [...cursorBody.issueComments, ...cursorPageTwoBody.issueComments].map(
          (comment) => comment.id,
        ),
      ).size,
    ).toBe(3);
  });

  it("rejects malformed created_at cursors", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const issueId = await createIssue(organizationSlug, project.id, headers);

    const response = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers,
      query: { sort: "created_at", cursor: "not-a-date|not-a-uuid" },
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_issue_comment_query",
    });
  });

  it("removes comments when the parent issue is deleted", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const issueId = await createIssue(organizationSlug, project.id, headers);

    const createResponse = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      method: "POST",
      headers,
      body: { body: "Will cascade" },
    });
    const created = (await createResponse.json()) as CommentResponse;

    await db.delete(schema.issueSheetIssues).where(eq(schema.issueSheetIssues.id, issueId));

    const remaining = await db
      .select({ id: schema.issueSheetComments.id })
      .from(schema.issueSheetComments)
      .where(eq(schema.issueSheetComments.id, created.issueComment.id));
    expect(remaining).toHaveLength(0);
  });

  it("returns 404 for inaccessible projects", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const issueId = await createIssue(organizationSlug, project.id, headers);

    const outsider = projectFixture.createWorkosIdentityWithRole("admin");
    const outsiderHeaders = await projectFixture.authHeadersFor(outsider);

    const response = await requestJson(commentsUrl(organizationSlug, project.id, issueId), {
      headers: outsiderHeaders,
    });
    expect(response.status).toBe(404);
  });
});
