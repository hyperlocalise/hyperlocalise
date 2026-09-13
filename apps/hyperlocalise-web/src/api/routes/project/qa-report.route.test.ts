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
    const created = (await createResponse.json()) as {
      report: { id: string; findingCount: number; errorCount: number };
    };
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
        query: {},
      },
      { headers },
    );

    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as {
      findings: Array<{ checkType: string; editorHref: string }>;
    };
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
    const body = (await response.json()) as { settings: { cadence: string } };
    expect(body.settings.cadence).toBe("daily");
  });

  it("lists native projects only on the workspace QA page", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();
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
    const body = (await response.json()) as { reports: Array<{ projectId: string }> };
    expect(body.reports.some((row) => row.projectId === project.id)).toBe(true);
    expect(body.reports.some((row) => row.projectId === providerProject?.id)).toBe(false);
  });

  it("exposes failed latest scans on the workspace QA page", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await db.insert(schema.translationQaRuns).values({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "scheduled",
      status: "failed",
      summary: { byCheckType: {}, bySeverity: {}, byLocale: {} },
      errorCode: "qa_scan_failed",
      completedAt: new Date(),
    });

    const response = await client.api.orgs[":organizationSlug"]["qa-reports"].$get(
      { param: { organizationSlug: identity.organization.slug! } },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reports: Array<{
        projectId: string;
        report: { status: string; findingCount: number } | null;
      }>;
    };
    const row = body.reports.find((entry) => entry.projectId === project.id);
    expect(row?.report?.status).toBe("failed");
    expect(row?.report?.findingCount).toBe(0);
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

  it("returns latest scan findings for CAT to reuse", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const [hello] = await db
      .insert(schema.projectTranslationKeys)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        key: "reuse",
        sourceText: "Save",
        normalizedSourceText: "save",
      })
      .returning();

    await db.insert(schema.projectTranslations).values({
      organizationId: organization.id,
      projectId: project.id,
      translationKeyId: hello!.id,
      targetLocale: "fr-FR",
      text: "Save",
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

    const latestResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ]["latest-findings"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
        },
        query: { locale: "fr-FR" },
      },
      { headers },
    );

    expect(latestResponse.status).toBe(200);
    const latest = (await latestResponse.json()) as {
      runId: string | null;
      findings: Array<{ key: string; checkType: string; targetText: string }>;
    };
    expect(latest.runId).toBeTruthy();
    expect(latest.findings.some((finding) => finding.key === "reuse")).toBe(true);
    expect(latest.findings.some((finding) => finding.checkType === "same_as_source")).toBe(true);
  });

  it("scans keys that have no translation row yet", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await db
      .update(schema.projects)
      .set({ targetLocales: ["fr-FR", "de-DE"] })
      .where(eq(schema.projects.id, project.id));

    await db.insert(schema.projectTranslationKeys).values({
      organizationId: organization.id,
      projectId: project.id,
      key: "welcome",
      sourceText: "Welcome",
      normalizedSourceText: "welcome",
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
    const created = (await createResponse.json()) as {
      report: { id: string; segmentCount: number; findingCount: number };
    };
    expect(created.report.segmentCount).toBe(2);

    const detailResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ][":runId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
          runId: created.report.id,
        },
        query: { checkType: "not_localized" },
      },
      { headers },
    );

    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as {
      findings: Array<{ key: string; targetLocale: string; targetText: string }>;
      total: number;
    };
    expect(detail.total).toBe(2);
    expect(detail.findings.map((finding) => finding.targetLocale).toSorted()).toEqual([
      "de-DE",
      "fr-FR",
    ]);
    expect(detail.findings.every((finding) => finding.targetText === "")).toBe(true);
  });

  it("pages findings after the first page", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await db.insert(schema.projectTranslationKeys).values(
      ["one", "two", "three"].map((key) => ({
        organizationId: organization.id,
        projectId: project.id,
        key,
        sourceText: key,
        normalizedSourceText: key,
      })),
    );

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
    const created = (await createResponse.json()) as { report: { id: string } };

    const firstPage = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ][":runId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
          runId: created.report.id,
        },
        query: { limit: 2, offset: 0 },
      },
      { headers },
    );
    const secondPage = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "qa-reports"
    ][":runId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug!,
          projectId: project.id,
          runId: created.report.id,
        },
        query: { limit: 2, offset: 2 },
      },
      { headers },
    );

    expect(firstPage.status).toBe(200);
    expect(secondPage.status).toBe(200);
    const first = (await firstPage.json()) as {
      findings: Array<{ id: string }>;
      total: number;
    };
    const second = (await secondPage.json()) as {
      findings: Array<{ id: string }>;
      total: number;
    };
    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
    expect(first.findings).toHaveLength(2);
    expect(second.findings).toHaveLength(1);
    expect(second.findings[0]?.id).not.toBe(first.findings[0]?.id);
  });

  it("reclaims a stale running scan so a new scan can start", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const startedAt = new Date(Date.now() - 11 * 60 * 1000);

    await db.insert(schema.translationQaRuns).values({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      status: "running",
      summary: { byCheckType: {}, bySeverity: {}, byLocale: {} },
      startedAt,
      createdAt: startedAt,
    });

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

    expect(response.status).toBe(201);
  });

  it("rejects a second scan while one is running", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    await db.insert(schema.translationQaRuns).values({
      organizationId: organization.id,
      projectId: project.id,
      trigger: "manual",
      status: "running",
      summary: { byCheckType: {}, bySeverity: {}, byLocale: {} },
      startedAt: new Date(),
    });

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

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "qa_scan_in_progress" });
  });
});
