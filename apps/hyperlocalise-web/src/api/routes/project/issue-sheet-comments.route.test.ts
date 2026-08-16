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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { eq } from "drizzle-orm";

import { createProjectTestFixture } from "./project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
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

type CommentResponse = {
  issueComment: IssueComment;
};

beforeAll(async () => {
  await db.$client.query("select 1");
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
  it("creates, updates, replies, and deletes comments", async () => {
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

    const feedResponse = await requestJson(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(project.id)}/issue-sheet/${encodeURIComponent(issueId)}/feed`,
      { headers },
    );
    expect(feedResponse.status).toBe(200);
    const feedBody = (await feedResponse.json()) as {
      items: Array<
        | { kind: "activity" }
        | {
            kind: "comment_thread";
            root: { id: string; body: string };
            replies: Array<{ id: string; body: string }>;
          }
      >;
      total: number;
    };
    const thread = feedBody.items.find((item) => item.kind === "comment_thread");
    expect(thread).toMatchObject({
      kind: "comment_thread",
      root: { id: created.issueComment.id, body: "Root comment" },
      replies: [{ id: reply.issueComment.id, body: "Reply comment" }],
    });

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

    const afterDelete = await requestJson(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(project.id)}/issue-sheet/${encodeURIComponent(issueId)}/feed`,
      { headers },
    );
    const afterDeleteBody = (await afterDelete.json()) as {
      items: Array<{ kind: string }>;
    };
    expect(afterDeleteBody.items.some((item) => item.kind === "comment_thread")).toBe(false);
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
