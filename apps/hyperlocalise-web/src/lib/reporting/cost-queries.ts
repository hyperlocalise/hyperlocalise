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
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/database/client";

import { hourlyCost, unitCost, usdString, usdUnits } from "./money";
import { liveRateRows, type BandPercentages } from "./rate-cards";
import type { ReportPeriod } from "./report-period";
import {
  dayEnd,
  dayStart,
  idList,
  jobTitle,
  scopedProjectIds,
  type ReportScope,
} from "./report-scope";
import { REPORT_STEPS, type RateBasis, type ReportStep, type ReportUnit } from "./report-units";
import type { MatchBucket } from "./word-analysis";
import type { BandCounts } from "./word-queries";

/**
 * Money for the Reports page. Estimates price the daily summary's units at the live rate card,
 * line by line in each line's own basis, when the page reads them; nothing priced is stored.
 * Spent amounts are the recorded costs, priced when the work was recorded, and billing's charges
 * for AI.
 */

const ZERO = BigInt(0);

/** A task's own rate, else its project budget's card, else the card chosen on the page. */
const PRICING_ORDER = "task rate, then the project budget's rate card, then the chosen card";

type Pricing = "rate" | "fixed" | "none";

type PricedGroup = {
  projectId: string;
  targetLocale: string;
  step: ReportStep;
  bucket: MatchBucket;
  pricing: Pricing;
  rateId: string | null;
  rateCardName: string | null;
  basis: RateBasis | null;
  rate: string | null;
  percentages: BandPercentages | null;
  /** In the unit the page shows. */
  units: number;
  /** In the rate line's basis; 0 for hourly lines and unpriced or fixed-fee work. */
  basisUnits: number;
};

type HourlyLine = {
  projectId: string;
  jobId: string;
  step: ReportStep;
  targetLocale: string;
  rateId: string;
  rate: string;
  estimatedMinutes: number | null;
  loggedMinutes: number;
  /** The task and step's languages on hourly lines, which share its time estimate. */
  languages: number;
};

const OPEN_TASK = sql`j.status in ('queued', 'running', 'waiting_for_review')`;
const LIVE_TASK = sql`j.status not in ('failed', 'cancelled')`;

/**
 * Units of work, priced. `all` is every current string of the tasks (failed and cancelled tasks
 * left out); `toCome` is the unfinished part of open tasks assigned to a person, plus unfinished
 * work already marked payable.
 */
async function pricedUnits(input: {
  organizationId: string;
  projectIds: string[];
  jobIds?: string[];
  targetLocale?: string;
  step?: ReportStep;
  unit: ReportUnit;
  rateCardName: string | null;
  measure: "all" | "toCome";
}) {
  const value = (unit: string): SQL =>
    input.measure === "all"
      ? sql.raw(`s.arrived_${unit}`)
      : sql.raw(`s.arrived_${unit} - s.arrived_done_${unit}`);
  const which =
    input.measure === "all"
      ? sql`(s.job_id is null or ${LIVE_TASK})`
      : // The condition the partial index `reporting_daily_by_task_open` is built on.
        sql`s.arrived_strings > s.arrived_done_strings
          and ((${OPEN_TASK} and j.assignee_type = 'user' and j.owner_user_id is not null)
            or (s.payable and (s.job_id is null or ${LIVE_TASK})))`;
  const result = await db.execute<{
    groups: PricedGroup[];
    hourly: HourlyLine[];
    tasks: number;
    languages: number;
  }>(sql`
    with live as (${liveRateRows(input.organizationId)}),
    units as (
      select s.project_id, s.job_id, s.source_locale, s.target_locale, s.step, s.bucket,
        sum(${value("words")}) as words, sum(${value("strings")}) as strings,
        sum(${value("characters")}) as characters,
        sum(${value("characters_with_spaces")}) as characters_with_spaces,
        sum(${value(input.unit)}) as shown
      from reporting_daily_by_task s
      left join jobs j on j.id = s.job_id
      where s.organization_id = ${input.organizationId}
        and s.project_id in (${idList(input.projectIds)})
        ${input.jobIds?.length ? sql`and s.job_id in (${idList(input.jobIds)})` : sql``}
        ${input.targetLocale ? sql`and s.target_locale = ${input.targetLocale}` : sql``}
        ${input.step ? sql`and s.step = ${input.step}` : sql``}
        and ${which}
      group by 1, 2, 3, 4, 5, 6
    ),
    resolved as (
      select u.*, t.override_usd is not null as fixed,
        case when t.rate_id is not null then tr.id else l.id end as rate_id,
        case when t.rate_id is not null then tr.name else l.name end as card,
        case when t.rate_id is not null then tr.basis else l.basis end as basis,
        case when t.rate_id is not null then tr.rate else l.rate end as rate,
        case when t.rate_id is not null then tr.percentages else l.percentages end as percentages
      from units u
      left join reporting_task_rates t on t.organization_id = ${input.organizationId}
        and t.job_id = u.job_id and t.step = u.step
      left join reporting_rates tr on tr.id = t.rate_id
      left join reporting_budgets b on b.organization_id = ${input.organizationId}
        and b.project_id = u.project_id
      left join live l on t.rate_id is null and not l.retired
        and l.name = coalesce(b.rate_card_name, ${input.rateCardName}::text)
        and l.source_locale = u.source_locale and l.target_locale = u.target_locale
        and l.step = u.step
    )
    select
      (select coalesce(json_agg(g), '[]') from (
        select project_id as "projectId", target_locale as "targetLocale", step, bucket,
          case when fixed then 'fixed' when rate_id is null then 'none' else 'rate' end as pricing,
          case when fixed then null else rate_id end as "rateId",
          case when fixed then null else card end as "rateCardName",
          case when fixed then null else basis end as basis,
          case when fixed then null else rate::text end as rate,
          case when fixed then null else percentages end as percentages,
          sum(shown)::float8 as units,
          sum(case when fixed then 0 when basis = 'word' then words
            when basis = 'character' then characters
            when basis = 'character_with_spaces' then characters_with_spaces else 0 end)::float8
            as "basisUnits"
        from resolved
        group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
        having sum(shown) > 0 or sum(words) > 0
      ) g) as groups,
      (select coalesce(json_agg(h), '[]') from (
        select r.project_id as "projectId", r.job_id as "jobId", r.step,
          r.target_locale as "targetLocale", r.rate_id as "rateId", r.rate::text as rate,
          t.estimated_minutes as "estimatedMinutes",
          (select coalesce(sum(e.minutes), 0) from reporting_time_entries e
            where e.organization_id = ${input.organizationId} and e.job_id = r.job_id
              and e.step = r.step and not e.voided)::integer as "loggedMinutes",
          (count(*) over (partition by r.job_id, r.step))::integer as languages
        from (
          select distinct project_id, job_id, step, target_locale, rate_id, rate from resolved
          where basis = 'hour' and not fixed and job_id is not null
        ) r
        left join reporting_task_rates t on t.organization_id = ${input.organizationId}
          and t.job_id = r.job_id and t.step = r.step
      ) h) as hourly,
      (select count(distinct job_id) from units)::integer as tasks,
      (select count(distinct target_locale) from units)::integer as languages
  `);
  return result.rows[0];
}

/** The share of a band a rate line pays; the unavailable band is paid as new work. */
function paidPercent(percentages: BandPercentages | null, bucket: MatchBucket): number {
  const band = bucket === "unavailable" ? "new" : bucket;
  return percentages?.[band] ?? 100;
}

/**
 * The cost of hourly lines: a task's time estimate for a step, shared evenly between the
 * languages it has on hourly lines. `remaining` takes off the time already logged.
 */
function hourlyCosts(lines: HourlyLine[], remaining: boolean, keyOf: (line: HourlyLine) => string) {
  const costs = new Map<string, bigint | null>();
  for (const line of lines) {
    const key = keyOf(line);
    const previous = costs.get(key);
    if (line.estimatedMinutes === null) {
      costs.set(key, null);
      continue;
    }
    const minutes = remaining
      ? Math.max(0, line.estimatedMinutes - line.loggedMinutes)
      : line.estimatedMinutes;
    const cost = usdUnits(hourlyCost(line.rate, minutes)) / BigInt(line.languages);
    costs.set(key, previous === null ? null : (previous ?? ZERO) + cost);
  }
  return costs;
}

type FixedFee = {
  id: string;
  projectId: string;
  jobId: string;
  jobTitle: string;
  step: ReportStep;
  amountUsd: string;
};

async function fixedFees(input: {
  organizationId: string;
  projectIds: string[];
  jobIds?: string[];
  step?: ReportStep;
  uncharged: boolean;
}): Promise<FixedFee[]> {
  const result = await db.execute<FixedFee>(sql`
    select t.id, j.project_id as "projectId", t.job_id as "jobId", ${jobTitle("j")} as "jobTitle",
      t.step, t.override_usd::text as "amountUsd"
    from reporting_task_rates t join jobs j on j.id = t.job_id
    where t.organization_id = ${input.organizationId} and t.override_usd is not null
      and j.project_id in (${idList(input.projectIds)}) and ${LIVE_TASK}
      ${input.jobIds?.length ? sql`and t.job_id in (${idList(input.jobIds)})` : sql``}
      ${input.step ? sql`and t.step = ${input.step}` : sql``}
      ${
        input.uncharged
          ? sql`and not exists (select 1 from reporting_costs c
              where c.organization_id = t.organization_id and c.operation_key = 'task-override:' || t.id)`
          : sql``
      }
    order by "jobTitle", t.step
  `);
  return result.rows;
}

export type CostEstimateRow = {
  targetLocale: string;
  step: ReportStep;
  /** `fixed`: the task has a fixed fee instead (listed in `fixedFees`); `none`: no rate. */
  pricing: Pricing;
  rateCardName: string | null;
  rateId: string | null;
  basis: RateBasis | null;
  rate: string | null;
  percentages: BandPercentages | null;
  bands: BandCounts;
  units: number;
  /** In the rate line's basis, after its band percentages. Null for hourly lines and no rate. */
  weighted: number | null;
  costUsd: string | null;
  /** An hourly line on a task with no time estimate, so its cost is not known. */
  unestimated: boolean;
};

export type CostEstimate = {
  rateCardName: string | null;
  pricingOrder: string;
  rows: CostEstimateRow[];
  fixedFees: Omit<FixedFee, "id" | "projectId">[];
  totals: {
    bands: BandCounts;
    units: number;
    /** Only when every priced row is per word, or every one per character, and so on. */
    weighted: number | null;
    weightedBasis: RateBasis | null;
    costUsd: string;
    /** Units with no rate, left out of the cost. */
    unpricedUnits: number;
    /** The share of the per-unit cost saved by match discounts, against paying every band in full. */
    memorySavings: number | null;
    tasks: number;
    languages: number;
    /** Some work has no rate or no time estimate, so the cost is too low. */
    incomplete: boolean;
  };
};

/** What the chosen tasks will cost: every current string, finished or not, at the live rates. */
export async function queryCostEstimate(
  input: ReportScope & { step?: ReportStep; unit: ReportUnit; rateCardName: string | null },
): Promise<CostEstimate> {
  const projectIds = scopedProjectIds(input);
  const empty: CostEstimate = {
    rateCardName: input.rateCardName,
    pricingOrder: PRICING_ORDER,
    rows: [],
    fixedFees: [],
    totals: {
      bands: {},
      units: 0,
      weighted: null,
      weightedBasis: null,
      costUsd: usdString(ZERO),
      unpricedUnits: 0,
      memorySavings: null,
      tasks: 0,
      languages: 0,
      incomplete: false,
    },
  };
  if (projectIds.length === 0) return empty;
  const [priced, fees] = await Promise.all([
    pricedUnits({ ...input, projectIds, measure: "all" }),
    fixedFees({ ...input, projectIds, uncharged: false }),
  ]);
  const lineKey = (line: { targetLocale: string; step: ReportStep; rateId: string | null }) =>
    `${line.targetLocale}\u0000${line.step}\u0000${line.rateId}`;
  const hourly = hourlyCosts(priced.hourly, false, lineKey);
  const rows = new Map<string, CostEstimateRow & { cost: bigint | null }>();
  const totals = { ...empty.totals, bands: {} as BandCounts };
  let cost = ZERO,
    perUnitCost = ZERO,
    perUnitFull = ZERO;
  const bases = new Set<RateBasis>();
  for (const group of priced.groups) {
    const key = `${group.targetLocale}\u0000${group.step}\u0000${group.pricing}\u0000${group.rateId}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        targetLocale: group.targetLocale,
        step: group.step,
        pricing: group.pricing,
        rateCardName: group.rateCardName,
        rateId: group.rateId,
        basis: group.basis,
        rate: group.rate,
        percentages: group.percentages,
        bands: {},
        units: 0,
        weighted: group.pricing === "rate" && group.basis !== "hour" ? 0 : null,
        costUsd: null,
        unestimated: false,
        cost: group.pricing === "rate" ? ZERO : null,
      };
      rows.set(key, row);
    }
    row.bands[group.bucket] = (row.bands[group.bucket] ?? 0) + group.units;
    row.units += group.units;
    totals.bands[group.bucket] = (totals.bands[group.bucket] ?? 0) + group.units;
    totals.units += group.units;
    if (group.pricing === "none") totals.unpricedUnits += group.units;
    if (group.pricing !== "rate" || group.basis === "hour" || !group.rate) continue;
    const percent = paidPercent(group.percentages, group.bucket);
    const units = Math.round(group.basisUnits);
    row.weighted! += (units * percent) / 100;
    const groupCost = usdUnits(unitCost(group.rate, units, percent));
    row.cost! += groupCost;
    perUnitCost += groupCost;
    perUnitFull += usdUnits(unitCost(group.rate, units));
    bases.add(group.basis!);
  }
  for (const row of rows.values()) {
    if (row.pricing === "rate" && row.basis === "hour") {
      // Work outside any task has no time estimate.
      row.cost = hourly.get(lineKey(row)) ?? null;
      row.unestimated = row.cost === null;
    }
    if (row.cost !== null) cost += row.cost;
    if (row.pricing === "none" || row.unestimated) totals.incomplete = true;
    row.costUsd = row.cost === null ? null : usdString(row.cost);
  }
  for (const fee of fees) cost += usdUnits(fee.amountUsd);
  totals.costUsd = usdString(cost);
  if (bases.size === 1) {
    totals.weightedBasis = [...bases][0];
    totals.weighted = [...rows.values()].reduce((sum, row) => sum + (row.weighted ?? 0), 0);
  }
  totals.memorySavings =
    perUnitFull > ZERO ? Number(perUnitFull - perUnitCost) / Number(perUnitFull) : null;
  totals.tasks = priced.tasks;
  totals.languages = priced.languages;
  return {
    ...empty,
    rows: [...rows.values()]
      .map(({ cost: _cost, ...row }) => row)
      .sort(
        (left, right) =>
          left.targetLocale.localeCompare(right.targetLocale) ||
          REPORT_STEPS.indexOf(left.step) - REPORT_STEPS.indexOf(right.step),
      ),
    fixedFees: fees.map(({ id: _id, projectId: _projectId, ...fee }) => fee),
    totals,
  };
}

export type StillToCome = { amountUsd: string; incomplete: boolean };

/**
 * What unfinished paid work will still cost, per project: unfinished strings of open tasks
 * assigned to a person and unfinished work already marked payable, at the live rates; the time
 * still estimated on hourly lines; and fixed fees not yet charged.
 */
export async function queryStillToCome(input: {
  organizationId: string;
  projectIds: string[];
  jobIds?: string[];
  rateCardName?: string | null;
}): Promise<Map<string, StillToCome>> {
  const byProject = new Map<string, { amount: bigint; incomplete: boolean }>();
  if (input.projectIds.length === 0) return new Map();
  const project = (projectId: string) => {
    let entry = byProject.get(projectId);
    if (!entry) {
      entry = { amount: ZERO, incomplete: false };
      byProject.set(projectId, entry);
    }
    return entry;
  };
  const [priced, fees] = await Promise.all([
    pricedUnits({
      ...input,
      unit: "words",
      rateCardName: input.rateCardName ?? null,
      measure: "toCome",
    }),
    fixedFees({ ...input, uncharged: true }),
  ]);
  for (const group of priced.groups) {
    const entry = project(group.projectId);
    if (group.pricing === "none") entry.incomplete = true;
    if (group.pricing !== "rate" || group.basis === "hour" || !group.rate) continue;
    entry.amount += usdUnits(
      unitCost(
        group.rate,
        Math.round(group.basisUnits),
        paidPercent(group.percentages, group.bucket),
      ),
    );
  }
  const hourly = hourlyCosts(
    priced.hourly,
    true,
    (line) => `${line.projectId}\u0000${line.jobId}\u0000${line.step}\u0000${line.targetLocale}`,
  );
  for (const line of priced.hourly) {
    const cost = hourly.get(
      `${line.projectId}\u0000${line.jobId}\u0000${line.step}\u0000${line.targetLocale}`,
    );
    const entry = project(line.projectId);
    if (cost === null || cost === undefined) entry.incomplete = true;
    else entry.amount += cost;
  }
  for (const fee of fees) project(fee.projectId).amount += usdUnits(fee.amountUsd);
  return new Map(
    [...byProject].map(([projectId, entry]) => [
      projectId,
      { amountUsd: usdString(entry.amount), incomplete: entry.incomplete },
    ]),
  );
}

type Spending = {
  people: bigint;
  expenses: bigint;
  /** Null when the costs are filtered by language: billing's AI charges have none. */
  ai: bigint | null;
  /** People's work with no rate, so no amount. */
  unpriced: number;
  /** Billed AI calls whose charge billing has not received yet. */
  pendingAi: number;
};

/**
 * Money spent per project: people's work and expenses as recorded, and billing's charges for AI
 * on the projects' tasks through our AI gateway (calls on the workspace's own provider key cost
 * the workspace nothing through us). With no days given, everything spent so far.
 */
async function spending(input: {
  organizationId: string;
  projectIds: string[];
  from?: string;
  to?: string;
  targetLocale?: string;
}): Promise<Map<string, Spending>> {
  const byProject = new Map<string, Spending>();
  if (input.projectIds.length === 0) return byProject;
  const within = (column: SQL) =>
    input.from && input.to
      ? sql`and ${column} >= ${dayStart(input.from)} and ${column} < ${dayEnd(input.to)}`
      : sql``;
  const [recorded, ai] = await Promise.all([
    db.execute<{
      projectId: string;
      kind: "human" | "expense";
      amount: string;
      unpriced: number;
    }>(sql`
      select c.project_id as "projectId", c.kind, round(coalesce(sum(c.amount_usd), 0), 8)::text as amount,
        count(*) filter (where c.amount_usd is null)::integer as unpriced
      from reporting_costs c
      where c.organization_id = ${input.organizationId}
        and c.project_id in (${idList(input.projectIds)})
        and not c.voided and c.kind in ('human', 'expense')
        ${input.targetLocale ? sql`and c.target_locale = ${input.targetLocale}` : sql``}
        ${within(sql`c.created_at`)}
      group by 1, 2
    `),
    input.targetLocale
      ? Promise.resolve({ rows: [] })
      : db.execute<{ projectId: string; amount: string; pending: number }>(sql`
          select j.project_id as "projectId", round(coalesce(sum(u.amount_usd), 0), 8)::text as amount,
            count(*) filter (where u.amount_usd is null)::integer as pending
          from usage_events u join jobs j on j.id = u.job_id
          where u.organization_id = ${input.organizationId}
            and j.project_id in (${idList(input.projectIds)})
            and u.feature_id = 'ai_tokens' and u.credential_source = 'gateway'
            and u.status <> 'rejected'
            ${within(sql`u.created_at`)}
          group by 1
        `),
  ]);
  const project = (projectId: string) => {
    let entry = byProject.get(projectId);
    if (!entry) {
      entry = {
        people: ZERO,
        expenses: ZERO,
        ai: input.targetLocale ? null : ZERO,
        unpriced: 0,
        pendingAi: 0,
      };
      byProject.set(projectId, entry);
    }
    return entry;
  };
  for (const row of recorded.rows) {
    const entry = project(row.projectId);
    if (row.kind === "human") entry.people += usdUnits(row.amount);
    else entry.expenses += usdUnits(row.amount);
    entry.unpriced += row.unpriced;
  }
  for (const row of ai.rows as { projectId: string; amount: string; pending: number }[]) {
    const entry = project(row.projectId);
    entry.ai = (entry.ai ?? ZERO) + usdUnits(row.amount);
    entry.pendingAi += row.pending;
  }
  return byProject;
}

function spentTotal(entry: Spending | undefined) {
  return entry ? entry.people + entry.expenses + (entry.ai ?? ZERO) : ZERO;
}

export type CostRow = {
  projectId: string;
  projectName: string;
  peopleUsd: string;
  aiUsd: string | null;
  expensesUsd: string;
  totalUsd: string;
};

export type Costs = {
  rows: CostRow[];
  totals: Omit<CostRow, "projectId" | "projectName">;
  previousTotalUsd: string;
  unpriced: number;
  pendingAi: number;
};

/** What was spent in a period, by project, with the previous period's total. */
export async function queryCosts(
  input: Omit<ReportScope, "jobIds"> & { period: ReportPeriod },
): Promise<Costs> {
  const projectIds = scopedProjectIds(input);
  const [current, previous, names] = await Promise.all([
    spending({ ...input, projectIds, from: input.period.from, to: input.period.to }),
    spending({
      ...input,
      projectIds,
      from: input.period.previousFrom,
      to: input.period.previousTo,
    }),
    projectNames(projectIds),
  ]);
  const languageFiltered = Boolean(input.targetLocale);
  const sum = { people: ZERO, expenses: ZERO, ai: ZERO };
  let unpriced = 0,
    pendingAi = 0;
  const rows: CostRow[] = [];
  for (const [projectId, entry] of current) {
    sum.people += entry.people;
    sum.expenses += entry.expenses;
    sum.ai += entry.ai ?? ZERO;
    unpriced += entry.unpriced;
    pendingAi += entry.pendingAi;
    rows.push({
      projectId,
      projectName: names.get(projectId) ?? projectId,
      peopleUsd: usdString(entry.people),
      aiUsd: entry.ai === null ? null : usdString(entry.ai),
      expensesUsd: usdString(entry.expenses),
      totalUsd: usdString(spentTotal(entry)),
    });
  }
  rows.sort((left, right) => left.projectName.localeCompare(right.projectName));
  return {
    rows,
    totals: {
      peopleUsd: usdString(sum.people),
      aiUsd: languageFiltered ? null : usdString(sum.ai),
      expensesUsd: usdString(sum.expenses),
      totalUsd: usdString(sum.people + sum.expenses + sum.ai),
    },
    previousTotalUsd: usdString(
      [...previous.values()].reduce((total, entry) => total + spentTotal(entry), ZERO),
    ),
    unpriced,
    pendingAi,
  };
}

export type BudgetStatus = "on_track" | "over_80" | "forecast_over" | "over_budget";

export type BudgetRow = {
  projectId: string;
  projectName: string;
  budgetUsd: string;
  rateCardName: string | null;
  spentUsd: string;
  stillToComeUsd: string;
  forecastUsd: string;
  remainingUsd: string;
  status: BudgetStatus;
  /** Some unfinished work has no rate or no time estimate, so still to come is too low. */
  incomplete: boolean;
  /** People's work with no rate, left out of spent. */
  unpriced: number;
  pendingAi: number;
};

/** The worst of a budget's states: spent past it, forecast past it, or past 80% spent. */
export function budgetStatus(budget: bigint, spent: bigint, forecast: bigint): BudgetStatus {
  if (spent > budget) return "over_budget";
  if (forecast > budget) return "forecast_over";
  if (spent * BigInt(100) >= budget * BigInt(80)) return "over_80";
  return "on_track";
}

/** Each project's all-time budget against what has been spent and what is still to come. */
export async function queryBudgets(input: {
  organizationId: string;
  projectIds: string[];
}): Promise<BudgetRow[]> {
  if (input.projectIds.length === 0) return [];
  const budgets = await db.execute<{
    projectId: string;
    projectName: string;
    budget: string;
    rateCardName: string | null;
  }>(sql`
    select b.project_id as "projectId", p.name as "projectName", b.budget::text as budget,
      b.rate_card_name as "rateCardName"
    from reporting_budgets b join projects p on p.id = b.project_id
    where b.organization_id = ${input.organizationId}
      and b.project_id in (${idList(input.projectIds)})
    order by p.name
  `);
  const projectIds = budgets.rows.map((row) => row.projectId);
  if (projectIds.length === 0) return [];
  const [spent, toCome] = await Promise.all([
    spending({ organizationId: input.organizationId, projectIds }),
    queryStillToCome({ organizationId: input.organizationId, projectIds }),
  ]);
  return budgets.rows.map(({ budget: budgetText, ...row }) => {
    const budget = usdUnits(budgetText);
    const spentAmount = spentTotal(spent.get(row.projectId));
    const pending = toCome.get(row.projectId);
    const toComeAmount = pending ? usdUnits(pending.amountUsd) : ZERO;
    const forecast = spentAmount + toComeAmount;
    return {
      ...row,
      budgetUsd: budgetText,
      spentUsd: usdString(spentAmount),
      stillToComeUsd: usdString(toComeAmount),
      forecastUsd: usdString(forecast),
      remainingUsd: usdString(budget - spentAmount),
      status: budgetStatus(budget, spentAmount, forecast),
      incomplete: pending?.incomplete ?? false,
      unpriced: spent.get(row.projectId)?.unpriced ?? 0,
      pendingAi: spent.get(row.projectId)?.pendingAi ?? 0,
    };
  });
}

async function projectNames(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, string>();
  const result = await db.execute<{ id: string; name: string }>(
    sql`select id, name from projects where id in (${idList(projectIds)})`,
  );
  return new Map(result.rows.map((row) => [row.id, row.name]));
}
