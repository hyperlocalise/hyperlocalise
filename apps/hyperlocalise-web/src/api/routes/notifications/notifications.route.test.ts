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

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { IssueNotificationService } from "@/lib/projects/issue-sheet/issue-notification-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { createProjectTestFixture } from "../project/project.fixture";

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
const issueSheetService = new IssueSheetService();
const notificationService = new IssueNotificationService();

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

function notificationsUrl(organizationSlug: string, path = "") {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/notifications${path}`;
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

describe("Issue notifications routes", () => {
  it("denies access when the workspace issues feature flag is disabled", async () => {
    workspaceIssuesFlagRunMock.mockResolvedValue(false);
    const { identity } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await requestJson(notificationsUrl(organizationSlug), { headers });
    expect(response.status).toBe(403);
  });

  it("lists, counts, marks one, and marks all notifications as read", async () => {
    const { identity, organization, user, project } =
      await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const otherIdentity = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "admin",
    );
    await projectFixture.authHeadersFor(otherIdentity);
    const otherUserId = await projectFixture.getLocalUserId(otherIdentity.user.workosUserId);

    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      body: { title: "Seed issue for notifications" },
    });

    await notificationService.notifyAssigned({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: otherUserId,
      assigneeUserId: user.id,
    });

    await projectFixture.authHeadersFor(identity);

    const listResponse = await requestJson(notificationsUrl(organizationSlug), { headers });
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      notifications: Array<{ id: string; issueId: string; readAt: string | null }>;
      total: number;
    };
    expect(listBody.total).toBeGreaterThanOrEqual(1);
    expect(listBody.notifications.some((item) => item.issueId === issue.id)).toBe(true);

    const countResponse = await requestJson(notificationsUrl(organizationSlug, "/unread-count"), {
      headers,
    });
    expect(countResponse.status).toBe(200);
    const countBody = (await countResponse.json()) as { unreadCount: number };
    expect(countBody.unreadCount).toBeGreaterThanOrEqual(1);

    const notificationId = listBody.notifications.find((item) => item.issueId === issue.id)!.id;
    const markOneResponse = await requestJson(
      notificationsUrl(organizationSlug, `/${notificationId}/read`),
      { method: "POST", headers },
    );
    expect(markOneResponse.status).toBe(200);

    const countAfterOne = await requestJson(notificationsUrl(organizationSlug, "/unread-count"), {
      headers,
    });
    const countAfterOneBody = (await countAfterOne.json()) as { unreadCount: number };
    expect(countAfterOneBody.unreadCount).toBeLessThan(countBody.unreadCount);

    await notificationService.notifyStatusChanged({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: otherUserId,
      previousStatus: "open",
      nextStatus: "resolved",
    });

    const markAllResponse = await requestJson(notificationsUrl(organizationSlug, "/read-all"), {
      method: "POST",
      headers,
    });
    expect(markAllResponse.status).toBe(200);

    const countAfterAll = await requestJson(notificationsUrl(organizationSlug, "/unread-count"), {
      headers,
    });
    const countAfterAllBody = (await countAfterAll.json()) as { unreadCount: number };
    expect(countAfterAllBody.unreadCount).toBe(0);
  });

  it("hides notifications for inaccessible projects from list and unread count", async () => {
    const { identity, organization, user, project } =
      await projectFixture.createStoredProjectFixture();
    const team = await ensureDefaultWorkspaceTeam(organization.id);

    const memberIdentity = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "member",
    );
    await projectFixture.authHeadersFor(memberIdentity);
    const memberUserId = await projectFixture.getLocalUserId(memberIdentity.user.workosUserId);
    await db
      .insert(schema.teamMemberships)
      .values({ teamId: team.id, userId: memberUserId, role: "member" })
      .onConflictDoNothing();

    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
      body: { title: "Hidden later" },
    });

    await notificationService.notifyAssigned({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      assigneeUserId: memberUserId,
    });

    const [isolatedTeam] = await db
      .insert(schema.teams)
      .values({
        organizationId: organization.id,
        slug: `isolated-${randomUUID()}`,
        name: `Isolated ${randomUUID()}`,
      })
      .returning();

    await db
      .update(schema.projects)
      .set({ teamId: isolatedTeam.id })
      .where(eq(schema.projects.id, project.id));

    const headers = await projectFixture.authHeadersFor(memberIdentity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const listResponse = await requestJson(notificationsUrl(organizationSlug), { headers });
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as {
      notifications: Array<{ issueId: string }>;
      total: number;
    };
    expect(listBody.notifications.every((item) => item.issueId !== issue.id)).toBe(true);

    const countResponse = await requestJson(notificationsUrl(organizationSlug, "/unread-count"), {
      headers,
    });
    const countBody = (await countResponse.json()) as { unreadCount: number };
    expect(countBody.unreadCount).toBe(listBody.total);
  });
});
