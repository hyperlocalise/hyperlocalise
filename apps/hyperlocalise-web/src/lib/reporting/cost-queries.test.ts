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

import { sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { isOk } from "@/lib/primitives/result/results";

import { resolveReportingRate } from "./capture";
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
      jobIds: [job.id],
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
      jobIds: [job.id],
      unit: "characters",
      rateCardName: "Standard",
    });
    expect(inCharacters.totals.costUsd).toBe(estimate.totals.costUsd);
    expect(inCharacters.rows.find((row) => row.targetLocale === "ja-JP")?.units).toBe(300);
  });

  it("uses a task's own rate, then the project budget's card, then the chosen card", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    await createCard(workspace, "Per word", [line("fr-FR", "0.10")]);
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
        jobIds: [first.id, second.id],
        unit: "words",
        rateCardName,
      });

    // The same language on two cards, priced per word on one and per character on the other.
    expect(usd((await estimate("Per word")).totals.costUsd)).toBe(2);
    expect(usd((await estimate("Per character")).totals.costUsd)).toBe(1);
    expect((await estimate(null)).rows).toEqual([
      expect.objectContaining({ pricing: "none", units: 20, pricedBy: [], rateCardName: null }),
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
      rateCardName: "Per word",
      pricedAt: sql`clock_timestamp()`,
    });
    const mixed = await estimate("Per word");
    expect(
      mixed.rows.map((row) => [row.rateCardName, row.basis, usd(row.costUsd), row.pricedBy]),
    ).toEqual(
      expect.arrayContaining([
        ["Per word", "word", 1, ["task"]],
        ["Per character", "character", 0.5, ["budget"]],
      ]),
    );
    expect(usd(mixed.totals.costUsd)).toBe(1.5);
  });

  it("prices a task by its own card's line for each language, as the card was when the task was priced", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    await createCard(workspace, "Standard", [line("fr-FR", "0.10"), line("ja-JP", "0.20")]);
    await createCard(workspace, "Agency", [line("fr-FR", "0.05"), line("de-DE", "0.07")]);
    await db.insert(schema.reportingBudgets).values({
      organizationId: organization.id,
      projectId: project.id,
      budget: "100",
      rateCardName: "Agency",
    });
    const priced = await createJob();
    const other = await createJob();
    await addSummary(
      [priced.id, other.id].flatMap((jobId) =>
        ["fr-FR", "ja-JP", "de-DE"].map((targetLocale) => ({
          jobId,
          targetLocale,
          day: "2026-06-01",
          arrived: 10,
        })),
      ),
    );
    await db.insert(schema.reportingTaskRates).values({
      organizationId: organization.id,
      jobId: priced.id,
      step: "translation",
      rateCardName: "Standard",
      pricedAt: sql`clock_timestamp()`,
    });
    // The card changes after the task was priced: the task keeps the earlier prices.
    const saved = await saveRateCard({
      organizationId: organization.id,
      actorId: workspace.user.id,
      name: "Standard",
      defaultBasis: "word",
      lines: [line("fr-FR", "0.30"), line("de-DE", "0.40")],
      create: false,
    });
    expect(isOk(saved)).toBe(true);
    const estimate = await queryCostEstimate({
      organizationId: organization.id,
      projectIds: [project.id],
      jobIds: [priced.id],
      unit: "words",
      rateCardName: "Standard",
    });
    expect(
      estimate.rows.map((row) => [
        row.targetLocale,
        row.pricing,
        row.rateCardName,
        row.pricedBy,
        usd(row.costUsd),
      ]),
    ).toEqual([
      // The task's card had no de-DE line when it was priced; the budget's card is not asked.
      ["de-DE", "none", "Standard", ["task"], null],
      ["fr-FR", "rate", "Standard", ["task"], 1],
      ["ja-JP", "rate", "Standard", ["task"], 2],
    ]);

    // A task without its own card takes the budget's, which has no ja-JP line.
    const budgeted = await queryCostEstimate({
      organizationId: organization.id,
      projectIds: [project.id],
      jobIds: [other.id],
      unit: "words",
      rateCardName: "Standard",
    });
    expect(
      budgeted.rows.map((row) => [
        row.targetLocale,
        row.rateCardName,
        row.pricedBy,
        usd(row.costUsd),
      ]),
    ).toEqual([
      ["de-DE", "Agency", ["budget"], 0.7],
      ["fr-FR", "Agency", ["budget"], 0.5],
      ["ja-JP", "Agency", ["budget"], null],
    ]);

    // Recorded work is priced the same way.
    const rate = (jobId: string, targetLocale: string) =>
      resolveReportingRate({
        organizationId: organization.id,
        projectId: project.id,
        jobId,
        sourceLocale: "en-US",
        targetLocale,
        step: "translation",
      });
    expect((await rate(priced.id, "fr-FR"))?.rate).toBe("0.10000000");
    expect(await rate(priced.id, "de-DE")).toBeNull();
    expect((await rate(other.id, "fr-FR"))?.rate).toBe("0.05000000");
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
    // 6 words still to do in the assigned task and in the open task's payable row; the tasks
    // that ended will do no more work.
    expect(toCome.get(project.id)).toEqual({ amountUsd: "12.00000000", incomplete: false });

    // Spent: people's work, expenses and billed AI in the project, on its tasks or not.
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
    const charge = (amountUsd: string, extra: Partial<typeof schema.usageEvents.$inferInsert>) => ({
      organizationId: organization.id,
      featureId: "ai_tokens" as const,
      status: "tracking_succeeded" as const,
      operationKey: `test:${randomUUID()}`,
      source: "translation_job_complete",
      credentialSource: "gateway",
      amountUsd,
      ...extra,
    });
    await db.insert(schema.usageEvents).values([
      charge("2.5", { jobId: assigned.id }),
      // Charged in the project outside any task, such as an editor suggestion.
      charge("1", {
        source: "content_editor_ai_suggestion",
        dimensions: { project_id: project.id },
      }),
    ]);
    const [budget] = await queryBudgets({
      organizationId: organization.id,
      projectIds: [project.id],
    });
    expect(budget).toMatchObject({
      projectId: project.id,
      projectName: "Docs",
      spentUsd: "81.50000000",
      stillToComeUsd: "12.00000000",
      forecastUsd: "93.50000000",
      remainingUsd: "18.50000000",
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

describe("still to come in detail", () => {
  it("counts open tasks of every open state, payable work outside any task, hourly time left and uncharged fees", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, user, createProject, createJob, addSummary } = workspace;
    const hourlyProject = await createProject("Hourly work");
    await createCard(workspace, "Mixed", [line("fr-FR", "1"), line("de-DE", "60", "hour")]);
    await db.insert(schema.reportingBudgets).values(
      [project.id, hourlyProject.id].map((projectId) => ({
        organizationId: organization.id,
        projectId,
        budget: "1000",
        rateCardName: "Mixed",
      })),
    );
    const unfinished = (jobId: string | null, targetLocale: string, payable = false) => ({
      jobId,
      targetLocale,
      payable,
      day: "2026-06-01",
      arrived: { words: 10, strings: 2 },
      arrivedDone: { words: 4, strings: 1 },
    });
    const queued = await createJob({ status: "queued", assigned: true });
    const reviewing = await createJob({ status: "waiting_for_review" });
    await addSummary([
      unfinished(queued.id, "fr-FR"),
      unfinished(reviewing.id, "fr-FR", true),
      unfinished(null, "fr-FR", true),
    ]);
    const toCome = await queryStillToCome({
      organizationId: organization.id,
      projectIds: [project.id, hourlyProject.id],
    });
    expect(toCome.get(project.id)).toEqual({ amountUsd: "18.00000000", incomplete: false });

    // Hourly work: time estimated but not yet logged is still to come; a task with no estimate
    // makes the amount incomplete rather than free.
    const estimated = await createJob({ projectId: hourlyProject.id, assigned: true });
    const unestimated = await createJob({ projectId: hourlyProject.id, assigned: true });
    const feeTask = await createJob({ projectId: hourlyProject.id, status: "queued" });
    const chargedTask = await createJob({ projectId: hourlyProject.id, status: "queued" });
    await addSummary([
      { ...unfinished(estimated.id, "de-DE"), projectId: hourlyProject.id },
      { ...unfinished(unestimated.id, "de-DE"), projectId: hourlyProject.id },
    ]);
    const [, , charged] = await db
      .insert(schema.reportingTaskRates)
      .values([
        {
          organizationId: organization.id,
          jobId: estimated.id,
          step: "translation",
          estimatedMinutes: 120,
        },
        {
          organizationId: organization.id,
          jobId: feeTask.id,
          step: "translation",
          overrideUsd: "50",
        },
        {
          organizationId: organization.id,
          jobId: chargedTask.id,
          step: "translation",
          overrideUsd: "70",
        },
      ])
      .returning();
    await db.insert(schema.reportingCosts).values({
      organizationId: organization.id,
      projectId: hourlyProject.id,
      jobId: chargedTask.id,
      operationKey: `task-override:${charged!.id}`,
      kind: "human",
      step: "translation",
      amountUsd: "70",
      basis: "manual",
    });
    await db.insert(schema.reportingTimeEntries).values({
      organizationId: organization.id,
      projectId: hourlyProject.id,
      jobId: estimated.id,
      contributorId: user.id,
      step: "translation",
      targetLocale: "de-DE",
      workDate: new Date("2026-06-01T00:00:00Z"),
      minutes: 30,
    });
    const hourly = await queryStillToCome({
      organizationId: organization.id,
      projectIds: [hourlyProject.id],
    });
    // 90 minutes left at $60, and the uncharged $50 fee.
    expect(hourly.get(hourlyProject.id)).toEqual({ amountUsd: "140.00000000", incomplete: true });
  });
});

describe("cost estimate filters", () => {
  it("keeps each language's share of a task's time under a language filter, and leaves fixed fees out", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    await createCard(workspace, "Hourly", [
      line("fr-FR", "60", "hour"),
      line("de-DE", "60", "hour"),
      line("ja-JP", "1"),
    ]);
    const estimated = await createJob();
    const unestimated = await createJob();
    const fee = await createJob({ title: "Landing page" });
    await addSummary([
      { jobId: estimated.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: 10 },
      { jobId: estimated.id, targetLocale: "de-DE", day: "2026-06-01", arrived: 10 },
      {
        jobId: estimated.id,
        targetLocale: "fr-FR",
        step: "review",
        day: "2026-06-01",
        arrived: 10,
      },
      { jobId: unestimated.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: 5 },
      { jobId: fee.id, targetLocale: "fr-FR", day: "2026-06-01", arrived: 7 },
      { jobId: unestimated.id, targetLocale: "ja-JP", day: "2026-06-01", arrived: 3, uncounted: 2 },
    ]);
    await db.insert(schema.reportingTaskRates).values([
      {
        organizationId: organization.id,
        jobId: estimated.id,
        step: "translation",
        estimatedMinutes: 90,
      },
      { organizationId: organization.id, jobId: fee.id, step: "translation", overrideUsd: "300" },
    ]);
    const estimate = (extra: { targetLocale?: string; step?: "translation" | "review" } = {}) =>
      queryCostEstimate({
        organizationId: organization.id,
        projectIds: [project.id],
        jobIds: [estimated.id, unestimated.id, fee.id],
        unit: "words",
        rateCardName: "Hourly",
        ...extra,
      });

    const french = await estimate({ targetLocale: "fr-FR", step: "translation" });
    const hourlyRow = french.rows.find((row) => row.pricing === "rate");
    // The estimated task's 90 minutes are shared with German; the other task has no estimate,
    // which is flagged without losing the known part.
    expect(hourlyRow).toMatchObject({ targetLocale: "fr-FR", unestimated: true });
    expect(usd(hourlyRow!.costUsd)).toBe(45);
    expect(french).toMatchObject({ fixedFees: [], fixedFeesLeftOut: 1 });
    expect(usd(french.totals.costUsd)).toBe(45);
    expect(french.totals).toMatchObject({ incomplete: true, languages: 1, tasks: 3 });

    // Review work has no review rate on the card.
    const review = await estimate({ step: "review" });
    expect(review.rows).toEqual([expect.objectContaining({ step: "review", pricing: "none" })]);

    // Strings whose words could not be counted make the cost incomplete.
    const japanese = await estimate({ targetLocale: "ja-JP" });
    expect(japanese.totals).toMatchObject({ uncounted: 2, incomplete: true });

    // A line taken off the card prices nothing from then on.
    await saveRateCard({
      organizationId: organization.id,
      actorId: workspace.user.id,
      name: "Hourly",
      defaultBasis: "word",
      lines: [line("fr-FR", "60", "hour"), line("de-DE", "60", "hour")],
      create: false,
    });
    const retired = await estimate({ targetLocale: "ja-JP" });
    expect(retired.rows).toEqual([expect.objectContaining({ pricing: "none", costUsd: null })]);
    const all = await estimate();
    expect(usd(all.totals.costUsd)).toBe(90 + 300);
  });
});

describe("uncounted and word-less strings", () => {
  it("prices strings with no words but characters whatever unit is shown", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createJob, addSummary } = workspace;
    await createCard(workspace, "Characters", [line("ja-JP", "0.1", "character")]);
    const job = await createJob();
    await addSummary([
      {
        jobId: job.id,
        targetLocale: "ja-JP",
        bucket: "new",
        day: "2026-06-01",
        arrived: { words: 0, strings: 2, characters: 40, characters_with_spaces: 40 },
      },
    ]);
    for (const unit of ["words", "strings", "characters"] as const) {
      const estimate = await queryCostEstimate({
        organizationId: organization.id,
        projectIds: [project.id],
        jobIds: [job.id],
        unit,
        rateCardName: "Characters",
      });
      expect(usd(estimate.totals.costUsd), unit).toBe(4);
    }
  });

  it("marks still to come incomplete only for uncounted strings that must still be open", async () => {
    const workspace = await fixture.createWorkspace();
    const { organization, project, createProject, createJob, addSummary } = workspace;
    const other = await createProject("Other");
    await createCard(workspace, "Standard", [line("fr-FR", "1")]);
    await db.insert(schema.reportingBudgets).values(
      [project.id, other.id].map((projectId) => ({
        organizationId: organization.id,
        projectId,
        budget: "100",
        rateCardName: "Standard",
      })),
    );
    const done = await createJob({ assigned: true });
    const open = await createJob({ projectId: other.id, assigned: true });
    await addSummary([
      // Three strings, one done and one uncounted: the uncounted one may be the done one.
      {
        jobId: done.id,
        targetLocale: "fr-FR",
        day: "2026-06-01",
        arrived: { words: 9, strings: 3 },
        arrivedDone: { words: 4, strings: 1 },
        uncounted: 1,
      },
      // Two uncounted strings and one done: at least one uncounted string is still open.
      {
        projectId: other.id,
        jobId: open.id,
        targetLocale: "fr-FR",
        day: "2026-06-01",
        arrived: { words: 9, strings: 3 },
        arrivedDone: { words: 4, strings: 1 },
        uncounted: 2,
      },
    ]);
    const toCome = await queryStillToCome({
      organizationId: organization.id,
      projectIds: [project.id, other.id],
    });
    expect(toCome.get(project.id)).toEqual({ amountUsd: "5.00000000", incomplete: false });
    expect(toCome.get(other.id)).toEqual({ amountUsd: "5.00000000", incomplete: true });
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
    type UsageRow = typeof schema.usageEvents.$inferInsert;
    const billed = (amountUsd: string | null, credentialSource: string, day: string): UsageRow => ({
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
    // A call with no task of its own, priced as AI credit: `parent` is the row it belongs to.
    const charge = (
      amountUsd: string,
      day: string,
      extra: { dimensions?: Record<string, string>; parent?: string } = {},
    ): UsageRow => ({
      ...billed(amountUsd, "gateway", day),
      source: "agent_runtime_complete",
      jobId: null,
      dimensions: {
        ...extra.dimensions,
        parent_operation_key: extra.parent ?? `none:${randomUUID()}`,
      },
    });
    const run = (
      operationKey: string,
      source: string,
      dimensions: Record<string, string> = {},
    ): UsageRow => ({
      organizationId: organization.id,
      featureId: "agent_runs" as const,
      status: "tracking_succeeded" as const,
      operationKey,
      source,
      dimensions,
      createdAt: at("2026-06-12"),
    });
    const [tmsRun] = await db
      .insert(schema.agentRuns)
      .values({
        organizationId: organization.id,
        providerKind: "crowdin",
        externalJobId: "42",
        kind: "translate",
        hyperlocaliseJobId: job.id,
      })
      .returning();
    const tmsKey = `agent-run:${tmsRun!.id}:agent_runs`;
    const slackKey = `slack:${randomUUID()}`;
    await db.insert(schema.usageEvents).values([
      billed("1.25", "gateway", "2026-06-10"),
      billed(null, "gateway", "2026-06-11"),
      // On the workspace's own provider key: nothing billed through us.
      billed("0", "byok", "2026-06-11"),
      // A connected TMS run on the task: on the task, through the run.
      run(tmsKey, "agent_run_create"),
      charge("0.2", "2026-06-12", { parent: tmsKey }),
      // An editor suggestion in the project, with no task.
      charge("0.4", "2026-06-12", { dimensions: { project_id: project.id } }),
      // A Slack turn whose run names the other project.
      run(slackKey, "slack_agent_turn", { project_id: other.id }),
      charge("0.3", "2026-06-12", { parent: slackKey }),
      // Chat with no project.
      charge("0.1", "2026-06-12"),
    ]);
    const period = resolvePeriod({
      from: "2026-06-08",
      to: "2026-06-14",
      today: "2026-10-21",
      startedDay: "2026-01-01",
    });
    const scope = { organizationId: organization.id, projectIds: [project.id, other.id], period };
    const costs = await queryCosts({ ...scope, includeUnattributed: true });
    expect(costs.rows).toEqual([
      {
        projectId: project.id,
        projectName: "Docs",
        peopleUsd: "10.50000000",
        aiUsd: "1.85000000",
        aiOnTasksUsd: "1.45000000",
        aiOutsideTasksUsd: "0.40000000",
        expensesUsd: "3.00000000",
        totalUsd: "15.35000000",
      },
      {
        projectId: other.id,
        projectName: "Help centre",
        peopleUsd: "0.00000000",
        aiUsd: "0.30000000",
        aiOnTasksUsd: "0.00000000",
        aiOutsideTasksUsd: "0.30000000",
        expensesUsd: "4.00000000",
        totalUsd: "4.30000000",
      },
    ]);
    // AI outside any project is its own line, in the totals and in the AI outside tasks.
    expect(costs).toMatchObject({
      outsideProjects: { aiUsd: "0.10000000" },
      totals: {
        aiUsd: "2.25000000",
        aiOnTasksUsd: "1.45000000",
        aiOutsideTasksUsd: "0.80000000",
        totalUsd: "19.75000000",
      },
      previousTotalUsd: "8.00000000",
      unpriced: 1,
      pendingAi: 1,
    });
    const projectsOnly = await queryCosts({ ...scope, includeUnattributed: false });
    expect(projectsOnly.outsideProjects).toBeNull();
    expect(projectsOnly.totals.totalUsd).toBe("19.65000000");
    const oneProject = await queryCosts({
      ...scope,
      projectId: other.id,
      includeUnattributed: true,
    });
    expect(oneProject.outsideProjects).toBeNull();
    expect(oneProject.totals.totalUsd).toBe("4.30000000");

    // AI charges have no language, so a language filter leaves them out, and says so.
    const french = await queryCosts({
      organizationId: organization.id,
      projectIds: [project.id],
      targetLocale: "fr-FR",
      period,
      includeUnattributed: true,
    });
    expect(french.rows).toEqual([
      expect.objectContaining({
        peopleUsd: "10.50000000",
        aiUsd: null,
        aiOnTasksUsd: null,
        aiOutsideTasksUsd: null,
        expensesUsd: "0.00000000",
      }),
    ]);
    expect(french.totals.aiUsd).toBeNull();
    expect(french.outsideProjects).toBeNull();
  });
});
