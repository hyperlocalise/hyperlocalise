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
import { db } from "@/lib/database";

import { createProjectTestFixture } from "../project/project.fixture";

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

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("Mention suggestions routes", () => {
  it("returns users and issues matching the query", async () => {
    const { identity, project, user } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createIssueResponse = await app.request(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(project.id)}/issue-sheet`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...Object.fromEntries(new Headers(headers).entries()),
        },
        body: JSON.stringify({
          title: "Mentionable Alpha",
          issueType: "general_question",
          externalRef: "HL-508",
        }),
      },
    );
    expect(createIssueResponse.status).toBe(201);
    const created = (await createIssueResponse.json()) as { issue: { id: string } };

    const response = await app.request(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/mentions?q=&projectId=${encodeURIComponent(project.id)}&limit=5`,
      { headers },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      mentionSuggestions: {
        users: { userId: string; displayName: string }[];
        issues: { issueId: string; displayKey: string; title: string }[];
      };
    };

    expect(body.mentionSuggestions.users.some((member) => member.userId === user.id)).toBe(true);
    expect(body.mentionSuggestions.issues).toEqual([
      expect.objectContaining({
        issueId: created.issue.id,
        displayKey: "HL-508",
        title: "Mentionable Alpha",
      }),
    ]);

    const excluded = await app.request(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/mentions?q=Alpha&projectId=${encodeURIComponent(project.id)}&issueId=${encodeURIComponent(created.issue.id)}`,
      { headers },
    );
    expect(excluded.status).toBe(200);
    const excludedBody = (await excluded.json()) as {
      mentionSuggestions: { issues: { issueId: string }[] };
    };
    expect(excludedBody.mentionSuggestions.issues).toEqual([]);

    const byKey = await app.request(
      `/api/orgs/${encodeURIComponent(organizationSlug)}/mentions?q=HL-508&projectId=${encodeURIComponent(project.id)}`,
      { headers },
    );
    expect(byKey.status).toBe(200);
    const byKeyBody = (await byKey.json()) as {
      mentionSuggestions: {
        issues: { issueId: string; displayKey: string; title: string }[];
      };
    };
    expect(byKeyBody.mentionSuggestions.issues).toEqual([
      expect.objectContaining({
        issueId: created.issue.id,
        displayKey: "HL-508",
        title: "Mentionable Alpha",
      }),
    ]);
  });
});
