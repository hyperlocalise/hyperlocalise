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

import { db, schema } from "@/lib/database/client";
import { isOk } from "@/lib/primitives/result/results";

import {
  budgetStatus,
  queryBudgets,
  queryCostEstimate,
  queryCosts,
  queryStillToCome,
} from "./cost-queries";
import { usdUnits } from "./money";
import { saveRateCard, type RateLineInput } from "./rate-cards";
import { createReportingTestFixture } from "./reporting.fixture";
import { resolvePeriod } from "./report-period";

const fixture = createReportingTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

const line = (
  targetLocale: string,
  rate: string,
  basis: RateLineInput["basis"] = "word",
  percentages: RateLineInput["percentages"] = {},
  step: RateLineInput["step"] = "translation",
): RateLineInput => ({ sourceLocale: "en-US", targetLocale, step, basis, rate, percentages });

async function createCard(
  workspace: { organization: { id: string }; user: { id: string } },
  name: string,
  lines: RateLineInput[],
) {
  const saved = await saveRateCard({
    organizationId: workspace.organization.id,
    actorId: workspace.user.id,
    name,
    defaultBasis: "word",
    lines,
    create: true,
  });
  if (!isOk(saved)) throw new Error("expected the card to save");
  return saved.value;
}

const usd = (value: string | null) => (value === null ? null : Number(value));

describe("cost estimate", () => {
  it("prices each line in its own basis, discounts match bands, and leaves no rate blank", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    await createCard(workspace, "Standard", [
      line("fr-FR", "0.10", "word", { "100": 20 }),
      line("ja-JP", "0.02", "character"),
    ]);
    const job = await createJob();
    await addSummary([
      { jobId: job.id, targetLocale: "fr-FR", bucket: "new", day: "2026-06-01", arrived: 100 },
      { jobId: job.id, targetLocale: "fr-FR", bucket: "100", day: "2026-06-02", arrived: 50 },
      // The unavailable band is paid as new work.
      {
        jobId: job.id,
        targetLocale: "fr-FR",
        bucket: "unavailable",
        day: "2026-06-02",
        arrived: 10,
      },
      {
        jobId: job.id,
        targetLocale: "ja-JP",
        bucket: "new",
        day: "2026-06-01",
        arrived: { words: 10, strings: 1, characters: 300, characters_with_spaces: 310 },
      },
      { jobId: job.id, targetLocale: "ko-KR", bucket: "new", day: "2026-06-01", arrived: 40 },
    ]);

    const estimate = await queryCostEstimate({
      organizationId: organization.id,
      projectIds: [project.id],
      unit: "words",
      rateCardName: "Standard",
    });
    const byLanguage = Object.fromEntries(estimate.rows.map((row) => [row.targetLocale, row]));
    expect(byLanguage["fr-FR"]).toMatchObject({
      pricing: "rate",
      basis: "word",
      bands: { new: 100, "100": 50, unavailable: 10 },
      units: 160,
      weighted: 120,
    });
    expect(usd(byLanguage["fr-FR"].costUsd)).toBe(12);
    // Shown in words, priced per character.
    expect(byLanguage["ja-JP"]).toMatchObject({ basis: "character", units: 10, weighted: 300 });
    expect(usd(byLanguage["ja-JP"].costUsd)).toBe(6);
    expect(byLanguage["ko-KR"]).toMatchObject({
      pricing: "none",
      rate: null,
      weighted: null,
      costUsd: null,
    });
    expect(estimate.totals).toMatchObject({
      units: 210,
      unpricedUnits: 40,
      // Weighted words and weighted characters do not add up.
      weighted: null,
      tasks: 1,
      languages: 3,
      incomplete: true,
    });
    expect(usd(estimate.totals.costUsd)).toBe(18);
    expect(estimate.totals.memorySavings).toBeCloseTo((22 - 18) / 22);

    // The same work in characters: the counts change, the money does not.
    const inCharacters = await queryCostEstimate({
      organizationId: organization.id,
      projectIds: [project.id],
      unit: "characters",
      rateCardName: "Standard",
    });
    expect(inCharacters.totals.costUsd).toBe(estimate.totals.costUsd);
    expect(inCharacters.rows.find((row) => row.targetLocale === "ja-JP")?.units).toBe(300);
  });

  it("uses a task's own rate, then the project budget's card, then the chosen card", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    const perWord = await createCard(workspace, "Per word", [line("fr-FR", "0.10")]);
    await createCard(workspace, "Per character", [line("fr-FR", "0.01", "character")]);
    const first = await createJob();
    const second = await createJob();
    const counts = { words: 10, strings: 1, characters: 50, characters_with_spaces: 60 };
    await addSummary([
      { jobId: first.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: counts },
      { jobId: second.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: counts },
    ]);
    const estimate = (rateCardName: string | null) =>
      queryCostEstimate({
        organizationId: organization.id,
        projectIds: [project.id],
        unit: "words",
        rateCardName,
      });

    // The same language on two cards, priced per word on one and per character on the other.
    expect(usd((await estimate("Per word")).totals.costUsd)).toBe(2);
    expect(usd((await estimate("Per character")).totals.costUsd)).toBe(1);
    expect((await estimate(null)).rows).toEqual([
      expect.objectContaining({ pricing: "none", units: 20 }),
    ]);

    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "100",
      rateCardName: "Per character",
    });
    expect(usd((await estimate("Per word")).totals.costUsd)).toBe(1);

    await db.insert(schema.reportingTaskRates).values({
      organizationId: organization.id,
      jobId: first.id,
      step: "translation",
      rateId: perWord.lines[0].id,
    });
    const mixed = await estimate("Per word");
    expect(mixed.rows.map((row) => [row.rateCardName, row.basis, usd(row.costUsd)])).toEqual(
      expect.arrayContaining([
        ["Per word", "word", 1],
        ["Per character", "character", 0.5],
      ]),
    );
    expect(usd(mixed.totals.costUsd)).toBe(1.5);
  });

  it("prices hourly lines from the task's time estimate and adds fixed fees", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    await createCard(workspace, "Hourly", [
      line("fr-FR", "60", "hour"),
      line("de-DE", "60", "hour"),
    ]);
    const hourly = await createJob();
    const unestimated = await createJob();
    const fixed = await createJob({ title: "Landing page" });
    await addSummary([
      { jobId: hourly.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: 10 },
      { jobId: hourly.id, targetLocale: "de-DE", day: "2026-06-01", arrived: 10 },
      { jobId: unestimated.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: 5 },
      { jobId: fixed.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: 7 },
    ]);
    await db.insert(schema.reportingTaskRates).values([
      {
        organizationId: organization.id,
        jobId: hourly.id,
        step: "translation",
        estimatedMinutes: 90,
      },
      { organizationId: organization.id, jobId: fixed.id, step: "translation", overrideUsd: "250" },
    ]);

    const estimate = await queryCostEstimate({
      organizationId: organization.id,
      projectIds: [project.id],
      jobIds: [hourly.id, fixed.id],
      unit: "words",
      rateCardName: "Hourly",
    });
    // An hour and a half at $60, shared by the task's two languages.
    expect(
      estimate.rows
        .filter((row) => row.pricing === "rate")
        .map((row) => [row.targetLocale, usd(row.costUsd)]),
    ).toEqual([
      ["de-DE", 45],
      ["fr-FR", 45],
    ]);
    expect(estimate.rows.find((row) => row.pricing === "fixed")).toMatchObject({ units: 7 });
    expect(estimate.fixedFees).toEqual([
      { jobId: fixed.id, jobTitle: "Landing page", step: "translation", amountUsd: "250.00000000" },
    ]);
    expect(usd(estimate.totals.costUsd)).toBe(340);
    expect(estimate.totals.incomplete).toBe(false);

    const withoutEstimate = await queryCostEstimate({
      organizationId: organization.id,
      projectIds: [project.id],
      jobIds: [unestimated.id],
      unit: "words",
      rateCardName: "Hourly",
    });
    expect(withoutEstimate.rows).toEqual([
      expect.objectContaining({ unestimated: true, costUsd: null }),
    ]);
    expect(withoutEstimate.totals.incomplete).toBe(true);
  });
});

describe("still to come and budgets", () => {
  it("counts unfinished work in open assigned tasks and work already marked payable", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    await createCard(workspace, "Standard", [line("fr-FR", "1")]);
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "100",
      rateCardName: "Standard",
    });
    const assigned = await createJob({ assigned: true });
    const automatic = await createJob();
    const finished = await createJob({ assigned: true, status: "succeeded" });
    const cancelled = await createJob({ assigned: true, status: "cancelled" });
    const unfinished = (jobId: string, payable = false) => ({
      jobId,
      targetLocale: "fr-FR",
      payable,
      day: "2026-06-01",
      arrived: { words: 10, strings: 2 },
      arrivedDone: { words: 4, strings: 1 },
    });
    await addSummary([
      unfinished(assigned.id),
      unfinished(automatic.id),
      unfinished(automatic.id, true),
      unfinished(finished.id, true),
      unfinished(cancelled.id, true),
      // Finished work costs nothing more.
      {
        jobId: assigned.id,
        targetLocale: "fr-FR",
        day: "2026-06-02",
        arrived: { words: 9, strings: 1 },
        arrivedDone: { words: 9, strings: 1 },
      },
    ]);
    const toCome = await queryStillToCome({
      organizationId: organization.id,
      projectIds: [project.id],
    });
    // 6 words still to do in the assigned task, and in each of the two payable live rows.
    expect(toCome.get(project.id)).toEqual({ amountUsd: "18.00000000", incomplete: false });

    // Spent: people's work, expenses and billed AI on the project's tasks.
    const cost = (
      kind: "human" | "expense" | "ai",
      amountUsd: string | null,
      extra: Partial<typeof schema.reportingCosts.$inferInsert> = {},
    ) => ({
      organizationId: organization.id,
      projectId: project.id,
      operationKey: `test:${randomUUID()}`,
      kind,
      step: "translation",
      amountUsd,
      basis: "manual" as const,
      ...extra,
    });
    await db
      .insert(schema.reportingCosts)
      .values([
        cost("human", "73"),
        cost("expense", "5"),
        cost("human", "1000", { voided: true }),
        cost("ai", "1000", { basis: "estimated" }),
      ]);
    await db.insert(schema.usageEvents).values({
      organizationId: organization.id,
      featureId: "ai_tokens",
      status: "tracking_succeeded",
      operationKey: `test:${randomUUID()}`,
      source: "translation_job_complete",
      credentialSource: "gateway",
      amountUsd: "2.5",
      jobId: assigned.id,
    });
    const [budget] = await queryBudgets({
      organizationId: organization.id,
      projectIds: [project.id],
    });
    expect(budget).toMatchObject({
      projectId: project.id,
      projectName: "Docs",
      spentUsd: "80.50000000",
      stillToComeUsd: "18.00000000",
      forecastUsd: "98.50000000",
      remainingUsd: "19.50000000",
      status: "over_80",
      incomplete: false,
    });
  });

  it("orders budget states from over budget to on track", () => {
    const budget = usdUnits("100");
    expect(budgetStatus(budget, usdUnits("101"), usdUnits("101"))).toBe("over_budget");
    expect(budgetStatus(budget, usdUnits("50"), usdUnits("120"))).toBe("forecast_over");
    expect(budgetStatus(budget, usdUnits("80"), usdUnits("90"))).toBe("over_80");
    expect(budgetStatus(budget, usdUnits("79"), usdUnits("100"))).toBe("on_track");
  });
});

describe("costs", () => {
  it("sums what was spent in a period by project, with the previous period's total", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createProject, createJob } = workspace;
    const other = await createProject("Help centre");
    const job = await createJob();
    const at = (day: string) => new Date(`${day}T12:00:00Z`);
    const cost = (
      kind: "human" | "expense",
      amountUsd: string | null,
      day: string,
      extra: Partial<typeof schema.reportingCosts.$inferInsert> = {},
    ) => ({
      organizationId: organization.id,
      projectId: project.id,
      operationKey: `test:${randomUUID()}`,
      kind,
      step: "translation",
      targetLocale: "fr-FR",
      amountUsd,
      basis: "manual" as const,
      createdAt: at(day),
      ...extra,
    });
    await db
      .insert(schema.reportingCosts)
      .values([
        cost("human", "10.5", "2026-06-10"),
        cost("human", null, "2026-06-10", { basis: "unpriced" }),
        cost("expense", "3", "2026-06-11", { targetLocale: null }),
        cost("expense", "4", "2026-06-12", { projectId: other.id }),
        cost("human", "8", "2026-06-03"),
      ]);
    const billed = (amountUsd: string | null, credentialSource: string, day: string) => ({
      organizationId: organization.id,
      featureId: "ai_tokens" as const,
      status: "tracking_succeeded" as const,
      operationKey: `test:${randomUUID()}`,
      source: "translation_job_complete",
      credentialSource,
      amountUsd,
      jobId: job.id,
      createdAt: at(day),
    });
    await db.insert(schema.usageEvents).values([
      billed("1.25", "gateway", "2026-06-10"),
      billed(null, "gateway", "2026-06-11"),
      // On the workspace's own provider key: nothing billed through us.
      billed("0", "byok", "2026-06-11"),
    ]);
    const period = resolvePeriod({
      from: "2026-06-08",
      to: "2026-06-14",
      today: "2026-10-21",
      startedDay: "2026-01-01",
    });
    const costs = await queryCosts({
      organizationId: organization.id,
      projectIds: [project.id, other.id],
      period,
    });
    expect(costs.rows).toEqual([
      {
        projectId: project.id,
        projectName: "Docs",
        peopleUsd: "10.50000000",
        aiUsd: "1.25000000",
        expensesUsd: "3.00000000",
        totalUsd: "14.75000000",
      },
      {
        projectId: other.id,
        projectName: "Help centre",
        peopleUsd: "0.00000000",
        aiUsd: "0.00000000",
        expensesUsd: "4.00000000",
        totalUsd: "4.00000000",
      },
    ]);
    expect(costs).toMatchObject({
      totals: { totalUsd: "18.75000000" },
      previousTotalUsd: "8.00000000",
      unpriced: 1,
      pendingAi: 1,
    });

    // AI charges have no language, so a language filter leaves them out, and says so.
    const french = await queryCosts({
      organizationId: organization.id,
      projectIds: [project.id],
      targetLocale: "fr-FR",
      period,
    });
    expect(french.rows).toEqual([
      expect.objectContaining({ peopleUsd: "10.50000000", aiUsd: null, expensesUsd: "0.00000000" }),
    ]);
    expect(french.totals.aiUsd).toBeNull();
  });
});
