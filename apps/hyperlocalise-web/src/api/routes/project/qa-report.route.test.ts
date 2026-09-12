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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { testClient } from "hono/testing";

import { app } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { runDueTranslationQaScans } from "@/lib/qa/schedule-due-qa-scans";

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

const client = testClient<AppType>(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("project QA reports", () => {
  it("scans native translations and lists findings", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const [hello] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "hello",
        sourceText: "Hello {name}",
        normalizedSourceText: "hello {name}",
      })
      .returning();

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: hello!.id,
      targetLocale: "fr-FR",
      text: "",
      status: "draft",
    });

    const createResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ].$post(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.report.findingCount).toBeGreaterThan(0);
    expect(created.report.errorCount).toBeGreaterThan(0);

    const detailResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ][":runId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
          runId: created.report.id,
        },
      },
      { headers },
    );

    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.findings.some((finding) => finding.checkType === "not_localized")).toBe(true);
    expect(detail.findings[0]?.editorHref).toContain("/files/content-editor");
  });

  it("rejects provider projects", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await db
      .update(schema.projects)
      .set({ source: "external_tms", externalProviderKind: "crowdin", externalProjectId: "1" })
      .where(eq(schema.projects.id, project.id));

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ].$post(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "qa_scan_not_supported" });
    expect(organization.id).toBeTruthy();
  });

  it("updates the daily scan cadence", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ].settings.$patch(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
        },
        json: { cadence: "daily" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings.cadence).toBe("daily");
  });

  it("lists native projects only on the workspace QA page", async () => {
    const { identity, organization, project, user } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const [providerProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: project.teamId,
        createdByUserId: user.id,
        name: "Crowdin Catalog",
        description: "",
        translationContext: "",
        source: "external_tms",
        externalProviderKind: "crowdin",
        externalProjectId: "902807",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const response = await client.api.orgs[":organizationSlug"]["qa-reports"].$get(
      { param: { organizationSlug: identity.organization.slug! } },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reports.some((row) => row.projectId === project.id)).toBe(true);
    expect(body.reports.some((row) => row.projectId === providerProject?.id)).toBe(false);
  });

  it("schedules daily scans for native projects and ignores provider projects", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();

    await db
      .update(schema.projects)
      .set({ qaScanCadence: "daily" })
      .where(eq(schema.projects.id, project.id));

    const [providerProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: organization.id,
        teamId: project.teamId,
        createdByUserId: user.id,
        name: "Phrase Catalog",
        description: "",
        translationContext: "",
        source: "external_tms",
        externalProviderKind: "phrase",
        externalProjectId: "42",
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
        qaScanCadence: "daily",
      })
      .returning();

    const result = await runDueTranslationQaScans({ limit: 50 });
    expect(result.succeeded).toBeGreaterThanOrEqual(1);

    const nativeRuns = await db
      .select({ id: schema.translationQaRuns.id })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.projectId, project.id));
    const providerRuns = await db
      .select({ id: schema.translationQaRuns.id })
      .from(schema.translationQaRuns)
      .where(eq(schema.translationQaRuns.projectId, providerProject!.id));

    expect(nativeRuns).toHaveLength(1);
    expect(providerRuns).toHaveLength(0);
  });
});
