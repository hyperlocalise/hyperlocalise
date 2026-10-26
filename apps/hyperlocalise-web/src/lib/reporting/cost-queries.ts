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

import { attributedUsage } from "./ai-attribution";
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

/**
 * A task's own rate card, else its project budget's card, else the card chosen on the page. The
 * first card found prices every language: a language it has no line for has no rate.
 */
const PRICING_ORDER = "task's rate card, then the project budget's rate card, then the chosen card";

type Pricing = "rate" | "fixed" | "none";

/** Which card priced work: the task's own, its project budget's, or the one chosen on the page. */
const PRICED_BY = ["task", "budget", "chosen"] as const;
export type PricedBy = (typeof PRICED_BY)[number];

type PricedGroup = {
  projectId: string;
  targetLocale: string;
  step: ReportStep;
  bucket: MatchBucket;
  pricing: Pricing;
  /** Null when no card applies at all. */
  pricedBy: PricedBy | null;
  rateId: string | null;
  /** The card that priced the work, or that has no line for it. */
  rateCardName: string | null;
  basis: RateBasis | null;
  rate: string | null;
  percentages: BandPercentages | null;
  /** In the unit the page shows. */
  units: number;
  /** In the rate line's basis; 0 for hourly lines and unpriced or fixed-fee work. */
  basisUnits: number;
  /** Strings whose units could not be counted, so they are priced at nothing. */
  uncounted: number;
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
 * Units of work, priced. `chosen` is every current string of the given tasks, finished or not;
 * `project` every current string of the given projects, in a task or not, from the projects'
 * current rows (a task's own card does not apply there: the project is priced as one);
 * `toCome` is the unfinished part of open tasks assigned to a person or marked payable, plus
 * unfinished payable work saved outside any task. A task that ended will do no more work.
 */
async function pricedUnits(input: {
  organizationId: string;
  projectIds: string[];
  jobIds?: string[];
  targetLocale?: string;
  step?: ReportStep;
  unit: ReportUnit;
  rateCardName: string | null;
  measure: "chosen" | "project" | "toCome";
}) {
  const value = (unit: string): SQL =>
    input.measure === "toCome"
      ? sql.raw(`s.arrived_${unit} - s.arrived_done_${unit}`)
      : sql.raw(`s.arrived_${unit}`);
  const projects = sql`s.project_id in (${idList(input.projectIds)})`;
  // Still to come counts only the uncounted strings that cannot all be among the done ones.
  const uncounted =
    input.measure === "toCome"
      ? sql`greatest(s.arrived_uncounted - s.arrived_done_strings, 0)`
      : sql`s.arrived_uncounted`;
  const tasks = input.jobIds?.length ? sql`and s.job_id in (${idList(input.jobIds)})` : sql``;
  const rows =
    input.measure === "chosen"
      ? sql`select s.* from reporting_daily_by_task s
          where s.organization_id = ${input.organizationId} and ${projects} ${tasks}`
      : input.measure === "project"
        ? sql`select s.*, null::text as job_id from reporting_current_by_project s
            where s.organization_id = ${input.organizationId} and ${projects}`
        : // Read task by task from the open tasks, through the summary's task index: tasks that
          // ended hold most of a workspace's rows, and a planner scanning them all is far slower.
          // Rows with as many strings done as arrived have nothing left to do.
          sql`select s.* from jobs j
          cross join lateral (
            select s.* from reporting_daily_by_task s
            where s.organization_id = ${input.organizationId} and s.job_id = j.id
              and ${projects} ${tasks} and s.arrived_strings > s.arrived_done_strings
              and (s.payable or (j.assignee_type = 'user' and j.owner_user_id is not null))
            -- Keeps the planner from merging this into one join over every row.
            offset 0
          ) s
          where j.organization_id = ${input.organizationId}
            and j.project_id in (${idList(input.projectIds)}) and ${OPEN_TASK}
          ${
            input.jobIds?.length
              ? sql``
              : sql`union all
                select s.* from reporting_daily_by_task s
                where s.organization_id = ${input.organizationId} and ${projects}
                  and s.job_id is null and s.payable and s.arrived_strings > s.arrived_done_strings`
          }`;
  // Only a task with its own rate, fee or time estimate is priced apart from the others, so
  // still to come adds up the rest of a project's open tasks together.
  const task =
    input.measure === "toCome"
      ? sql`case when own.id is not null then s.job_id end`
      : sql`s.job_id`;
  const chosenLanguage = input.targetLocale
    ? sql`target_locale = ${input.targetLocale}`
    : sql`true`;
  const result = await db.execute<{
    groups: PricedGroup[];
    hourly: HourlyLine[];
    tasks: number;
    languages: number;
  }>(sql`
    with live as (${liveRateRows(input.organizationId)}),
    -- Each task card's lines as the card was when its task was priced: the newest row of each
    -- line from then on. Few tasks have a card, so this is read once, not row by row.
    task_lines as (
      select distinct on (t.job_id, t.step, r.source_locale, r.target_locale)
        t.job_id, t.step, r.source_locale, r.target_locale, r.id, r.basis, r.rate,
        r.percentages, r.retired
      from reporting_task_rates t
      join reporting_rates r on r.organization_id = t.organization_id
        and r.name = t.rate_card_name and r.step = t.step and r.created_at <= t.priced_at
      where t.organization_id = ${input.organizationId} and t.rate_card_name is not null
      order by t.job_id, t.step, r.source_locale, r.target_locale, r.created_at desc, r.id desc
    ),
    units as (
      select s.project_id, ${task} as job_id, s.source_locale, s.target_locale, s.step, s.bucket,
        sum(${value("words")}) as words, sum(${value("strings")}) as strings,
        sum(${value("characters")}) as characters,
        sum(${value("characters_with_spaces")}) as characters_with_spaces,
        sum(${value(input.unit)}) as shown, sum(${uncounted}) as uncounted
      from (${rows}) s
      ${
        input.measure === "toCome"
          ? sql`left join reporting_task_rates own on own.organization_id = ${input.organizationId}
              and own.job_id = s.job_id and own.step = s.step`
          : sql``
      }
      where true ${input.step ? sql`and s.step = ${input.step}` : sql``}
      group by 1, 2, 3, 4, 5, 6
    ),
    resolved as (
      select u.*, t.override_usd is not null as fixed,
        case when t.rate_card_name is not null then 'task'
          when b.rate_card_name is not null then 'budget'
          when ${input.rateCardName}::text is not null then 'chosen' end as priced_by,
        case when t.rate_card_name is not null then tr.id else l.id end as rate_id,
        coalesce(t.rate_card_name, b.rate_card_name, ${input.rateCardName}::text) as card,
        case when t.rate_card_name is not null then tr.basis else l.basis end as basis,
        case when t.rate_card_name is not null then tr.rate else l.rate end as rate,
        case when t.rate_card_name is not null then tr.percentages else l.percentages end
          as percentages
      from units u
      left join reporting_task_rates t on t.organization_id = ${input.organizationId}
        and t.job_id = u.job_id and t.step = u.step
      left join task_lines tr on t.rate_card_name is not null and not tr.retired
        and tr.job_id = u.job_id and tr.step = u.step
        and tr.source_locale = u.source_locale and tr.target_locale = u.target_locale
      left join reporting_budgets b on b.organization_id = ${input.organizationId}
        and b.project_id = u.project_id
      left join live l on t.rate_card_name is null and not l.retired
        and l.name = coalesce(b.rate_card_name, ${input.rateCardName}::text)
        and l.source_locale = u.source_locale and l.target_locale = u.target_locale
        and l.step = u.step
    )
    select
      (select coalesce(json_agg(g), '[]') from (
        select project_id as "projectId", target_locale as "targetLocale", step, bucket,
          case when fixed then 'fixed' when rate_id is null then 'none' else 'rate' end as pricing,
          case when fixed then null else priced_by end as "pricedBy",
          case when fixed then null else rate_id end as "rateId",
          case when fixed then null else card end as "rateCardName",
          case when fixed then null else basis end as basis,
          case when fixed then null else rate::text end as rate,
          case when fixed then null else percentages end as percentages,
          sum(shown)::float8 as units,
          sum(case when fixed then 0 when basis = 'word' then words
            when basis = 'character' then characters
            when basis = 'character_with_spaces' then characters_with_spaces else 0 end)::float8
            as "basisUnits",
          sum(uncounted)::float8 as uncounted
        from resolved where ${chosenLanguage}
        group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
        -- Every group with work in it, whatever unit is shown: money never depends on it.
        having sum(strings) > 0 or sum(uncounted) > 0
      ) g) as groups,
      (select coalesce(json_agg(h), '[]') from (
        select r.project_id as "projectId", r.job_id as "jobId", r.step,
          r.target_locale as "targetLocale", r.rate_id as "rateId", r.rate::text as rate,
          t.estimated_minutes as "estimatedMinutes",
          (select coalesce(sum(e.minutes), 0) from reporting_time_entries e
            where e.organization_id = ${input.organizationId} and e.project_id = r.project_id
              and e.job_id = r.job_id and e.step = r.step and not e.voided)::integer
            as "loggedMinutes",
          r.languages
        from (
          -- Counted over every language of the task, so a language filter keeps each share.
          select *, (count(*) over (partition by job_id, step))::integer as languages from (
            select distinct project_id, job_id, step, target_locale, rate_id, rate from resolved
            where basis = 'hour' and not fixed
          ) lines
        ) r
        -- Work outside any task, or in a task with no rate of its own, has no time estimate.
        left join reporting_task_rates t on t.organization_id = ${input.organizationId}
          and t.job_id = r.job_id and t.step = r.step
        where ${input.targetLocale ? sql`r.target_locale = ${input.targetLocale}` : sql`true`}
      ) h) as hourly,
      (select count(distinct job_id) from units where ${chosenLanguage})::integer as tasks,
      (select count(distinct target_locale) from units where ${chosenLanguage})::integer
        as languages
  `);
  return result.rows[0];
}

/** The share of a band a rate line pays; the unavailable band is paid as new work. */
function paidPercent(percentages: BandPercentages | null, bucket: MatchBucket): number {
  const band = bucket === "unavailable" ? "new" : bucket;
  return percentages?.[band] ?? 100;
}

type HourlyCost = { cost: bigint; known: boolean; unestimated: boolean };

/**
 * The cost of hourly lines: a task's time estimate for a step, shared evenly between the
 * languages it has on hourly lines. `remaining` takes off the time already logged. A line
 * whose task has no estimate adds nothing and marks the cost `unestimated`.
 */
function hourlyCosts(lines: HourlyLine[], remaining: boolean, keyOf: (line: HourlyLine) => string) {
  const costs = new Map<string, HourlyCost>();
  for (const line of lines) {
    const key = keyOf(line);
    const entry = costs.get(key) ?? { cost: ZERO, known: false, unestimated: false };
    costs.set(key, entry);
    if (line.estimatedMinutes === null) {
      entry.unestimated = true;
      continue;
    }
    const minutes = remaining
      ? Math.max(0, line.estimatedMinutes - line.loggedMinutes)
      : line.estimatedMinutes;
    entry.cost += usdUnits(hourlyCost(line.rate, minutes)) / BigInt(line.languages);
    entry.known = true;
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
  if (input.projectIds.length === 0) return [];
  const result = await db.execute<FixedFee>(sql`
    select t.id, j.project_id as "projectId", t.job_id as "jobId", ${jobTitle("j")} as "jobTitle",
      t.step, t.override_usd::text as "amountUsd"
    from reporting_task_rates t join jobs j on j.id = t.job_id
    where t.organization_id = ${input.organizationId} and t.override_usd is not null
      and j.project_id in (${idList(input.projectIds)})
      ${input.jobIds?.length ? sql`and t.job_id in (${idList(input.jobIds)})` : sql``}
      ${input.step ? sql`and t.step = ${input.step}` : sql``}
      ${
        input.uncharged
          ? sql`and ${LIVE_TASK} and not exists (select 1 from reporting_costs c
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
  /** Which cards priced the row, in pricing order; empty when no card applies. */
  pricedBy: PricedBy[];
  /** The card that priced the row, or that has no rate for its language. */
  rateCardName: string | null;
  rateId: string | null;
  basis: RateBasis | null;
  rate: string | null;
  percentages: BandPercentages | null;
  bands: BandCounts;
  units: number;
  /** In the rate line's basis, after its band percentages. Null for hourly lines and no rate. */
  weighted: number | null;
  /** Null when nothing in the row could be priced. */
  costUsd: string | null;
  /** An hourly line on a task with no time estimate: that task's part of the cost is missing. */
  unestimated: boolean;
  /** Strings whose units could not be counted, priced at nothing. */
  uncounted: number;
};

export type CostEstimate = {
  rateCardName: string | null;
  pricingOrder: string;
  rows: CostEstimateRow[];
  fixedFees: Omit<FixedFee, "id" | "projectId">[];
  /** Fixed fees belong to a task, not a language, so a language filter leaves them out. */
  fixedFeesLeftOut: number;
  totals: {
    bands: BandCounts;
    units: number;
    /** Only when every priced row is per word, or every one per character, and so on. */
    weighted: number | null;
    weightedBasis: RateBasis | null;
    costUsd: string;
    /** Units with no rate, left out of the cost. */
    unpricedUnits: number;
    /** Strings whose units could not be counted. */
    uncounted: number;
    /**
     * Units whose match band could not be worked out (the memory could not be read when they
     * arrived), priced as new work, so the cost may be too high.
     */
    unavailableUnits: number;
    /** The share of the per-unit cost saved by match discounts, against paying every band in full. */
    memorySavings: number | null;
    tasks: number;
    languages: number;
    /** Some work has no rate, no time estimate or no match band, so the cost is not exact. */
    incomplete: boolean;
  };
};

/**
 * What the chosen tasks will cost: every current string, finished or not, at the live rates.
 * With no tasks chosen and one project, the whole project: every current string it holds, in a
 * task or not, from its current rows. A whole workspace is never estimated: its tasks hold
 * millions of summary rows.
 */
export async function queryCostEstimate(
  input: Omit<ReportScope, "jobIds"> & {
    jobIds: string[];
    step?: ReportStep;
    unit: ReportUnit;
    rateCardName: string | null;
  },
): Promise<CostEstimate> {
  const projectIds = scopedProjectIds(input);
  const wholeProject = input.jobIds.length === 0 && Boolean(input.projectId);
  const empty: CostEstimate = {
    rateCardName: input.rateCardName,
    pricingOrder: PRICING_ORDER,
    rows: [],
    fixedFees: [],
    fixedFeesLeftOut: 0,
    totals: {
      bands: {},
      units: 0,
      weighted: null,
      weightedBasis: null,
      costUsd: usdString(ZERO),
      unpricedUnits: 0,
      uncounted: 0,
      unavailableUnits: 0,
      memorySavings: null,
      tasks: 0,
      languages: 0,
      incomplete: false,
    },
  };
  if (projectIds.length === 0 || (input.jobIds.length === 0 && !wholeProject)) return empty;
  const [priced, allFees] = await Promise.all([
    pricedUnits({ ...input, projectIds, measure: wholeProject ? "project" : "chosen" }),
    // A whole project is priced as one: no task's fixed fee stands in for its strings.
    wholeProject ? [] : fixedFees({ ...input, projectIds, uncharged: false }),
  ]);
  const fees = input.targetLocale ? [] : allFees;
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
    const key = [
      group.targetLocale,
      group.step,
      group.pricing,
      group.rateCardName,
      group.rateId,
    ].join("\u0000");
    let row = rows.get(key);
    if (!row) {
      row = {
        targetLocale: group.targetLocale,
        step: group.step,
        pricing: group.pricing,
        pricedBy: [],
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
        uncounted: 0,
        cost: group.pricing === "rate" ? ZERO : null,
      };
      rows.set(key, row);
    }
    if (group.pricedBy && !row.pricedBy.includes(group.pricedBy)) row.pricedBy.push(group.pricedBy);
    if (group.units > 0) row.bands[group.bucket] = (row.bands[group.bucket] ?? 0) + group.units;
    row.units += group.units;
    // Uncounted strings matter only where work is priced per unit.
    if (group.pricing === "rate" && group.basis !== "hour") {
      row.uncounted += group.uncounted;
      totals.uncounted += group.uncounted;
    }
    if (group.units > 0)
      totals.bands[group.bucket] = (totals.bands[group.bucket] ?? 0) + group.units;
    totals.units += group.units;
    if (group.pricing === "none") totals.unpricedUnits += group.units;
    if (group.bucket === "unavailable" && group.units > 0) totals.unavailableUnits += group.units;
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
      const hours = hourly.get(lineKey(row));
      row.cost = hours?.known ? hours.cost : null;
      row.unestimated = !hours || hours.unestimated;
    }
    if (row.cost !== null) cost += row.cost;
    if (row.pricing === "none" || row.unestimated || row.uncounted > 0) totals.incomplete = true;
  }
  if (totals.unavailableUnits > 0) totals.incomplete = true;
  for (const row of rows.values()) {
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
      .map(({ cost: _cost, ...row }) => ({
        ...row,
        pricedBy: PRICED_BY.filter((source) => row.pricedBy.includes(source)),
      }))
      .sort(
        (left, right) =>
          left.targetLocale.localeCompare(right.targetLocale) ||
          REPORT_STEPS.indexOf(left.step) - REPORT_STEPS.indexOf(right.step),
      ),
    fixedFees: fees.map(({ id: _id, projectId: _projectId, ...fee }) => fee),
    fixedFeesLeftOut: allFees.length - fees.length,
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
  step?: ReportStep;
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
    if (group.bucket === "unavailable" && group.units > 0) entry.incomplete = true;
    if (group.pricing !== "rate" || group.basis === "hour" || !group.rate) continue;
    if (group.uncounted > 0) entry.incomplete = true;
    entry.amount += usdUnits(
      unitCost(
        group.rate,
        Math.round(group.basisUnits),
        paidPercent(group.percentages, group.bucket),
      ),
    );
  }
  for (const [projectId, hours] of hourlyCosts(priced.hourly, true, (line) => line.projectId)) {
    const entry = project(projectId);
    entry.amount += hours.cost;
    if (hours.unestimated) entry.incomplete = true;
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
  /** Billing's AI charges on the project's tasks; null when the costs are filtered by language. */
  aiOnTasks: bigint | null;
  /** Billing's AI charges in the project with no task, such as content editor suggestions. */
  aiOutsideTasks: bigint | null;
  /** People's work with no rate, so no amount. */
  unpriced: number;
  /** Billed AI calls whose charge billing has not received yet. */
  pendingAi: number;
};

type SpendingResult = {
  byProject: Map<string, Spending>;
  /** Billing's AI charges tied to no project, when asked for and not filtered by language. */
  outsideProjects: { aiOnTasks: bigint; aiOutsideTasks: bigint; pendingAi: number } | null;
};

/**
 * Money spent per project: people's work and expenses as recorded, and billing's charges for AI
 * through our AI gateway (calls on the workspace's own provider key cost the workspace nothing
 * through us), placed in projects by `attributedUsage`. A charge on a task counts by its task,
 * one with no task by its recorded project, so none counts twice. With no days given,
 * everything spent so far.
 */
async function spending(input: {
  organizationId: string;
  projectIds: string[];
  from?: string;
  to?: string;
  targetLocale?: string;
  outsideProjects?: boolean;
}): Promise<SpendingResult> {
  const byProject = new Map<string, Spending>();
  const withAi = !input.targetLocale;
  const outside = withAi && Boolean(input.outsideProjects);
  if (input.projectIds.length === 0 && !outside) return { byProject, outsideProjects: null };
  const within = (column: SQL) =>
    input.from && input.to
      ? sql`and ${column} >= ${dayStart(input.from)} and ${column} < ${dayEnd(input.to)}`
      : sql``;
  const projects = input.projectIds.length
    ? sql`project_id in (${idList(input.projectIds)})`
    : sql`false`;
  const [recorded, ai] = await Promise.all([
    input.projectIds.length
      ? db.execute<{
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
        `)
      : Promise.resolve({ rows: [] }),
    withAi
      ? db.execute<{
          projectId: string | null;
          onTask: boolean;
          amount: string;
          pending: number;
        }>(sql`
          select project_id as "projectId", job_id is not null as "onTask",
            round(coalesce(sum(amount_usd), 0), 8)::text as amount,
            count(*) filter (where amount_usd is null)::integer as pending
          from (${attributedUsage({
            organizationId: input.organizationId,
            where: sql`u.feature_id = 'ai_tokens' and u.credential_source = 'gateway'
              and u.status <> 'rejected' ${within(sql`u.created_at`)}`,
          })}) charges
          where ${outside ? sql`(${projects} or project_id is null)` : projects}
          group by 1, 2
        `)
      : Promise.resolve({ rows: [] }),
  ]);
  const project = (projectId: string) => {
    let entry = byProject.get(projectId);
    if (!entry) {
      entry = {
        people: ZERO,
        expenses: ZERO,
        aiOnTasks: withAi ? ZERO : null,
        aiOutsideTasks: withAi ? ZERO : null,
        unpriced: 0,
        pendingAi: 0,
      };
      byProject.set(projectId, entry);
    }
    return entry;
  };
  for (const row of recorded.rows as {
    projectId: string;
    kind: "human" | "expense";
    amount: string;
    unpriced: number;
  }[]) {
    const entry = project(row.projectId);
    if (row.kind === "human") entry.people += usdUnits(row.amount);
    else entry.expenses += usdUnits(row.amount);
    entry.unpriced += row.unpriced;
  }
  const outsideProjects = outside ? { aiOnTasks: ZERO, aiOutsideTasks: ZERO, pendingAi: 0 } : null;
  for (const row of ai.rows as {
    projectId: string | null;
    onTask: boolean;
    amount: string;
    pending: number;
  }[]) {
    if (row.projectId === null) {
      // A task outside any project, or a call with none, such as chat.
      if (row.onTask) outsideProjects!.aiOnTasks += usdUnits(row.amount);
      else outsideProjects!.aiOutsideTasks += usdUnits(row.amount);
      outsideProjects!.pendingAi += row.pending;
      continue;
    }
    const entry = project(row.projectId);
    if (row.onTask) entry.aiOnTasks = (entry.aiOnTasks ?? ZERO) + usdUnits(row.amount);
    else entry.aiOutsideTasks = (entry.aiOutsideTasks ?? ZERO) + usdUnits(row.amount);
    entry.pendingAi += row.pending;
  }
  return { byProject, outsideProjects };
}

function aiTotal(entry: Spending | undefined) {
  return entry ? (entry.aiOnTasks ?? ZERO) + (entry.aiOutsideTasks ?? ZERO) : ZERO;
}

function spentTotal(entry: Spending | undefined) {
  return entry ? entry.people + entry.expenses + aiTotal(entry) : ZERO;
}

export type CostRow = {
  projectId: string;
  projectName: string;
  peopleUsd: string;
  /** Both parts of the project's AI; null when the costs are filtered by language. */
  aiUsd: string | null;
  aiOnTasksUsd: string | null;
  aiOutsideTasksUsd: string | null;
  expensesUsd: string;
  totalUsd: string;
};

export type Costs = {
  rows: CostRow[];
  /** AI charged with no project (chat, assistants, tasks outside any project), when no project is chosen. */
  outsideProjects: { aiUsd: string; aiOnTasksUsd: string; aiOutsideTasksUsd: string } | null;
  /** Every row, and AI outside any project when it is shown. */
  totals: Omit<CostRow, "projectId" | "projectName">;
  previousTotalUsd: string;
  unpriced: number;
  pendingAi: number;
};

/**
 * What was spent in a period, by project, with the previous period's total. With
 * `includeUnattributed` and no project chosen, AI charged outside any project is added as its
 * own line and in the totals, so the workspace's total covers all of billing's AI charges.
 */
export async function queryCosts(
  input: Omit<ReportScope, "jobIds"> & { period: ReportPeriod; includeUnattributed: boolean },
): Promise<Costs> {
  const projectIds = scopedProjectIds(input);
  const outsideProjects = input.includeUnattributed && !input.projectId;
  const [current, previous, names] = await Promise.all([
    spending({
      ...input,
      projectIds,
      from: input.period.from,
      to: input.period.to,
      outsideProjects,
    }),
    spending({
      ...input,
      projectIds,
      from: input.period.previousFrom,
      to: input.period.previousTo,
      outsideProjects,
    }),
    projectNames(projectIds),
  ]);
  const languageFiltered = Boolean(input.targetLocale);
  const sum = { people: ZERO, expenses: ZERO, aiOnTasks: ZERO, aiOutsideTasks: ZERO };
  let unpriced = 0,
    pendingAi = current.outsideProjects?.pendingAi ?? 0;
  const ai = (amount: bigint | null) => (amount === null ? null : usdString(amount));
  const rows: CostRow[] = [];
  for (const [projectId, entry] of current.byProject) {
    sum.people += entry.people;
    sum.expenses += entry.expenses;
    sum.aiOnTasks += entry.aiOnTasks ?? ZERO;
    sum.aiOutsideTasks += entry.aiOutsideTasks ?? ZERO;
    unpriced += entry.unpriced;
    pendingAi += entry.pendingAi;
    rows.push({
      projectId,
      projectName: names.get(projectId) ?? projectId,
      peopleUsd: usdString(entry.people),
      aiUsd: languageFiltered ? null : usdString(aiTotal(entry)),
      aiOnTasksUsd: ai(entry.aiOnTasks),
      aiOutsideTasksUsd: ai(entry.aiOutsideTasks),
      expensesUsd: usdString(entry.expenses),
      totalUsd: usdString(spentTotal(entry)),
    });
  }
  rows.sort((left, right) => left.projectName.localeCompare(right.projectName));
  const outside = current.outsideProjects;
  const onTasks = sum.aiOnTasks + (outside?.aiOnTasks ?? ZERO);
  const outsideTasks = sum.aiOutsideTasks + (outside?.aiOutsideTasks ?? ZERO);
  const allAi = onTasks + outsideTasks;
  const previousTotal =
    [...previous.byProject.values()].reduce((total, entry) => total + spentTotal(entry), ZERO) +
    (previous.outsideProjects
      ? previous.outsideProjects.aiOnTasks + previous.outsideProjects.aiOutsideTasks
      : ZERO);
  return {
    rows,
    outsideProjects: outside
      ? {
          aiUsd: usdString(outside.aiOnTasks + outside.aiOutsideTasks),
          aiOnTasksUsd: usdString(outside.aiOnTasks),
          aiOutsideTasksUsd: usdString(outside.aiOutsideTasks),
        }
      : null,
    totals: {
      peopleUsd: usdString(sum.people),
      aiUsd: languageFiltered ? null : usdString(allAi),
      aiOnTasksUsd: languageFiltered ? null : usdString(onTasks),
      aiOutsideTasksUsd: languageFiltered ? null : usdString(outsideTasks),
      expensesUsd: usdString(sum.expenses),
      totalUsd: usdString(sum.people + sum.expenses + allAi),
    },
    previousTotalUsd: usdString(previousTotal),
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
  const [{ byProject: spent }, toCome] = await Promise.all([
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
