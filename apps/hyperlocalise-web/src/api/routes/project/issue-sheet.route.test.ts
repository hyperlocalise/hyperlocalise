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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";

import { createProjectTestFixture } from "./project.fixture";

const {
  enqueueQueryImportedActivityMock,
  resolveApiAuthContextFromSessionMock,
  isAutumnBooleanFeatureEnabledMock,
} = vi.hoisted(() => ({
  enqueueQueryImportedActivityMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  isAutumnBooleanFeatureEnabledMock: vi.fn(async () => true),
}));

vi.mock("@/lib/activity-log/query-events", () => ({
  enqueueQueryCreatedActivity: vi.fn(),
  enqueueQueryDeletedActivity: vi.fn(),
  enqueueQueryImportedActivity: enqueueQueryImportedActivityMock,
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/billing/autumn-boolean-feature-access", () => ({
  isAutumnBooleanFeatureEnabled: isAutumnBooleanFeatureEnabledMock,
}));

const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture(client);

function issueSheet() {
  return client.api.orgs[":organizationSlug"].projects[":projectId"]["issue-sheet"];
}

const titleMapping = [{ csvHeader: "Summary", target: { kind: "system", field: "title" } }];

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  isAutumnBooleanFeatureEnabledMock.mockResolvedValue(true);
  await projectFixture.cleanup();
});

describe("Issue Sheet import route", () => {
  it("returns forbidden when the Queries Board entitlement is disabled", async () => {
    isAutumnBooleanFeatureEnabledMock.mockResolvedValue(false);
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await issueSheet().import.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          content: "Summary\nFirst import issue",
          dryRun: true,
          mapping: titleMapping,
        },
      } as never,
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "feature_unavailable" });
  });

  it("imports issues from csv with dry run and duplicate skip", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const csv = `Summary,Status,External ID,Priority
First import issue,Open,EXT-1,P1
Second import issue,Done,EXT-2,P2`;

    const mapping = [
      { csvHeader: "Summary", target: { kind: "system", field: "title" } },
      { csvHeader: "Status", target: { kind: "system", field: "status" } },
      { csvHeader: "External ID", target: { kind: "system", field: "external_ref" } },
      {
        csvHeader: "Priority",
        target: { kind: "create", key: "csv_priority", label: "CSV Priority", type: "select" },
      },
    ];

    const previewResponse = await issueSheet().import.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          content: csv,
          dryRun: true,
          mapping,
        },
      } as never,
      { headers },
    );
    expect(previewResponse.status).toBe(200);
    const previewBody = (await previewResponse.json()) as {
      import: { created: number; skippedDuplicates: number };
    };
    expect(previewBody.import.created).toBe(2);
    expect(previewBody.import.skippedDuplicates).toBe(0);

    const importResponse = await issueSheet().import.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          content: csv,
          dryRun: false,
          mapping,
        },
      } as never,
      { headers },
    );
    expect(importResponse.status).toBe(201);
    const importBody = (await importResponse.json()) as {
      import: { created: number; skippedDuplicates: number };
    };
    expect(importBody.import.created).toBe(2);
    expect(enqueueQueryImportedActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        itemCount: 2,
        projectId: project.id,
      }),
    );

    const reimportResponse = await issueSheet().import.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          content: csv,
          dryRun: true,
          mapping,
        },
      } as never,
      { headers },
    );
    const reimportBody = (await reimportResponse.json()) as {
      import: { created: number; skippedDuplicates: number };
    };
    expect(reimportBody.import.created).toBe(0);
    expect(reimportBody.import.skippedDuplicates).toBe(2);

    const imported = await db
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(eq(schema.issueSheetIssues.projectId, project.id));
    expect(imported).toHaveLength(2);
  });

  it("rejects duplicate system field mappings", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await issueSheet().import.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: {
          content: "Title,Summary\nIssue one,Issue two",
          dryRun: true,
          mapping: [
            { csvHeader: "Title", target: { kind: "system", field: "title" } },
            { csvHeader: "Summary", target: { kind: "system", field: "title" } },
          ],
        },
      } as never,
      { headers },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_issue_sheet_import_payload");
  });
});
