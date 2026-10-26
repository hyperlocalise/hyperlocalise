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
import {
  AI_IMAGE_SOURCES,
  AI_VIDEO_SOURCES,
  CHANNEL_RULES,
  ORIGIN_BY_AGENT_RUN_KIND,
  ORIGIN_RULES,
  type AiUsageDimension,
  type SourceRule,
} from "./ai-usage-origins";
import { usdString, usdUnits } from "./money";
import { addDays, type ReportPeriod } from "./report-period";
import {
  dayEnd,
  dayStart,
  idList,
  jobTitle,
  scopedProjectIds,
  type ReportScope,
} from "./report-scope";

/**
 * AI usage for the Reports page, from billing's records (`usage_events`): calls, tokens, images
 * and videos, and billing's charge for calls through our AI gateway, grouped by one detail and
 * optionally a second, with the period before for the headline numbers and a chart over time.
 * The charge is billing's actual charge, never an estimate; calls on the workspace's own
 * provider key use no plan credit and are counted apart.
 */

/** Groups per page of the table. */
export const AI_USAGE_PAGE_SIZE = 50;
/** The chart stacks this many of the largest groups, and the rest as one "Other". */
export const AI_USAGE_CHART_GROUPS = 5;
/** Rows under each group of the table, the rest shown as one "Other" row. */
export const AI_USAGE_CHILD_ROWS = 10;

export type AiUsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  videos: number;
  /** Billing's charge for calls through our AI gateway, as fixed-point USD. */
  chargeUsd: string;
  /**
   * Calls, images and videos whose charge billing has no record of: not received, failed, or
   * from before billing recorded the key.
   */
  unrecordedCharges: number;
  /** Calls, images and videos on the workspace's own provider key, which use no plan credit. */
  ownKeyCalls: number;
};

/** The details a call can be narrowed to; the project is the page's own project filter. */
export type AiUsageFilters = Partial<Record<Exclude<AiUsageDimension, "project">, string>>;

export type AiUsageGroup = AiUsageTotals & {
  /** An area, a model, a project's id and so on; null for none, such as a call with no task. */
  key: string | null;
  /** The name of a project, task or automation; null for the other details. */
  label: string | null;
  /** Every row under a group beyond the largest few, together; never a filter. */
  other?: boolean;
};

export type AiUsageRow = AiUsageGroup & { children: AiUsageGroup[] };

export type AiUsageSeries = {
  /** The chart's groups, largest first, then "Other" when there are more. */
  groups: { key: string | null; label: string | null; other: boolean }[];
  /** One point per day or week; each list has a value per group, in the order of `groups`. */
  points: { start: string; calls: number[]; tokens: number[]; chargeUsd: number[] }[];
};

export type AiUsage = {
  period: ReportPeriod;
  groupBy: AiUsageDimension;
  thenBy: AiUsageDimension | null;
  totals: AiUsageTotals;
  previous: AiUsageTotals;
  rows: AiUsageRow[];
  /** Groups in the whole table, across pages. */
  totalGroups: number;
  page: number;
  pageSize: number;
  series: AiUsageSeries;
  /** The name of the automation the usage is narrowed to, if any. */
  automationName: string | null;
};

export type AiUsageQuery = Omit<ReportScope, "jobIds" | "targetLocale"> & {
  period: ReportPeriod;
  /** Count calls tied to no project, which only ever count with no project chosen. */
  includeUnattributed: boolean;
  filters?: AiUsageFilters;
  groupBy: AiUsageDimension;
  thenBy?: AiUsageDimension | null;
  page?: number;
  /** Every group, for a download. */
  all?: boolean;
};

/** The column of `usageRows` holding each detail. */
const COLUMNS: Record<AiUsageDimension, SQL> = {
  area: sql.raw("area"),
  feature: sql.raw("feature"),
  model: sql.raw("model"),
  provider: sql.raw("provider"),
  channel: sql.raw("channel"),
  key: sql.raw("key_type"),
  project: sql.raw("project"),
  task: sql.raw("task"),
  automation: sql.raw("automation"),
};

/** A token count from a usage row's dimensions; anything that is not a number counts as 0. */
function tokens(key: "input_tokens" | "output_tokens") {
  const value = sql.raw(`u.dimensions ->> '${key}'`);
  return sql`case when ${value} ~ '^[0-9]+([.][0-9]+)?$' then (${value})::numeric else 0 end`;
}

/** The `when` branches of a SQL case for source rules, in the rules' order. */
function ruleBranches<T extends string>(rules: SourceRule<T>[], column: SQL): SQL {
  return sql.join(
    rules.map((rule) =>
      "exact" in rule
        ? sql`when ${column} = ${rule.exact} then ${rule.result}::text`
        : sql`when starts_with(${column}, ${rule.prefix}) then ${rule.result}::text`,
    ),
    sql` `,
  );
}

/** `aiOrigin` in SQL, from the same rules. */
function areaSql(source: SQL, agentRunKind: SQL): SQL {
  const media = [...AI_IMAGE_SOURCES, ...AI_VIDEO_SOURCES];
  const kinds = Object.entries(ORIGIN_BY_AGENT_RUN_KIND).map(([exact, result]) => ({
    exact,
    result,
  }));
  return sql`case
    when ${source} in (${idList(media)}) then 'images_and_video'
    when ${source} = 'agent_run_create' then case ${ruleBranches(kinds, agentRunKind)} else 'other' end
    ${ruleBranches(ORIGIN_RULES, source)}
    else 'other' end`;
}

/** `aiChannel` in SQL, from the same rules. */
function channelSql(source: SQL, viaApiKey: SQL): SQL {
  return sql`case ${ruleBranches(CHANNEL_RULES, source)}
    when ${viaApiKey} then 'api' else 'app' end`;
}

/**
 * The calls from `from` to the end of the period that the viewer may see, each with every
 * detail it can be grouped by, narrowed by the filters: the CTEs `calls` and `filtered`.
 */
function usageRows(input: AiUsageQuery, from: string): SQL {
  const projectIds = scopedProjectIds(input);
  const attributed = projectIds.length ? sql`project_id in (${idList(projectIds)})` : sql`false`;
  const projects =
    input.includeUnattributed && !input.projectId
      ? sql`(${attributed} or project_id is null)`
      : attributed;
  const media = idList([...AI_IMAGE_SOURCES, ...AI_VIDEO_SOURCES]);
  const filters = Object.entries(input.filters ?? {}).flatMap(([dimension, value]) =>
    value === undefined ? [] : [sql`${COLUMNS[dimension as AiUsageDimension]} = ${value}`],
  );
  return sql`
    calls as (
      select
        ${areaSql(sql.raw("u.source"), sql.raw("u.agent_run_kind"))} as area,
        u.source as feature,
        u.model_id as model,
        case when strpos(u.model_id, '/') > 1 then split_part(u.model_id, '/', 1) end as provider,
        ${channelSql(sql.raw("u.source"), sql.raw("u.via_api_key"))} as channel,
        case u.credential_source when 'gateway' then 'our_ai' when 'byok' then 'own_key'
          else 'not_recorded' end as key_type,
        u.project_id as project, u.job_id as task, u.automation_id as automation,
        u.source, u.source in (${media}) as media, u.credential_source, u.amount_usd,
        u.created_at,
        ${tokens("input_tokens")} as input_tokens,
        ${tokens("output_tokens")} as output_tokens
      from (${attributedUsage({
        organizationId: input.organizationId,
        where: sql`u.created_at >= ${dayStart(from)}
          and u.created_at < ${dayEnd(input.period.to)}
          and u.status <> 'rejected' and u.feature_id = 'ai_tokens'`,
      })}) u
      where ${projects}
    ),
    filtered as (
      select * from calls
      ${filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``}
    )`;
}

/**
 * The measures of a group of `filtered` rows. Billing writes one token row for each finished
 * call, image or video (a failed one leaves only its reservation, which is not read), so a token
 * row under an image or video counts as that image or video, never as a call: its tokens are
 * the image count or the video's seconds. The charge counts our gateway, as Costs does.
 */
function measures(): SQL {
  const images = idList([...AI_IMAGE_SOURCES]);
  return sql`
    count(*) filter (where not media)::integer as calls,
    coalesce(sum(input_tokens) filter (where not media), 0)::float8 as "inputTokens",
    coalesce(sum(output_tokens) filter (where not media), 0)::float8 as "outputTokens",
    count(*) filter (where media and source in (${images}))::integer as images,
    count(*) filter (where media and source not in (${images}))::integer as videos,
    round(coalesce(sum(amount_usd) filter (where credential_source = 'gateway'), 0), 8)::text
      as "chargeUsd",
    count(*) filter (where credential_source is distinct from 'byok'
      and (credential_source is distinct from 'gateway' or amount_usd is null))::integer
      as "unrecordedCharges",
    count(*) filter (where credential_source = 'byok')::integer as "ownKeyCalls"`;
}

/** Largest first: by tokens, then images and videos, then calls. */
const SORT_COLUMNS = sql`
  coalesce(sum(input_tokens + output_tokens) filter (where not media), 0) as sort_tokens,
  count(*) filter (where media) as sort_media,
  count(*) as sort_calls`;

/** The name of the project, task or automation a group's key stands for. */
function labelSql(dimension: AiUsageDimension, key: SQL, organizationId: string): SQL {
  switch (dimension) {
    case "project":
      return sql`(select lp.name from projects lp
        where lp.organization_id = ${organizationId} and lp.id = ${key})`;
    case "task":
      return sql`(select ${jobTitle("lj")} from jobs lj
        where lj.organization_id = ${organizationId} and lj.id = ${key})`;
    case "automation":
      return sql`(select la.name from workspace_automations la
        where la.organization_id = ${organizationId} and la.id::text = ${key})`;
    default:
      return sql`null::text`;
  }
}

const ZERO: AiUsageTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  images: 0,
  videos: 0,
  chargeUsd: "0.00000000",
  unrecordedCharges: 0,
  ownKeyCalls: 0,
};

function totalsOf(row: AiUsageTotals): AiUsageTotals {
  return {
    calls: row.calls,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    images: row.images,
    videos: row.videos,
    chargeUsd: row.chargeUsd,
    unrecordedCharges: row.unrecordedCharges,
    ownKeyCalls: row.ownKeyCalls,
  };
}

/** Headline totals for the period and the one before it. */
async function queryTotals(input: AiUsageQuery) {
  const result = await db.execute<AiUsageTotals & { current: boolean }>(sql`
    with ${usageRows(input, input.period.previousFrom)}
    select created_at >= ${dayStart(input.period.from)} as current, ${measures()}
    from filtered group by 1
  `);
  const current = result.rows.find((row) => row.current);
  const previous = result.rows.find((row) => !row.current);
  return {
    totals: current ? totalsOf(current) : ZERO,
    previous: previous ? totalsOf(previous) : ZERO,
  };
}

type TableRow = AiUsageTotals & {
  key1: string | null;
  key2: string | null;
  label1: string | null;
  label2: string | null;
  /** Null on the one row of a page past the end, which carries only the total. */
  child: boolean | null;
  total: number;
  /** On a group's row: how many groups by the second detail it has. */
  children: number;
};

/** A group's totals less those of the groups shown under it: what "Other" stands for. */
function remainder(group: AiUsageTotals, shown: AiUsageTotals[]): AiUsageTotals {
  const less = (key: Exclude<keyof AiUsageTotals, "chargeUsd">) =>
    group[key] - shown.reduce((sum, row) => sum + row[key], 0);
  return {
    calls: less("calls"),
    inputTokens: less("inputTokens"),
    outputTokens: less("outputTokens"),
    images: less("images"),
    videos: less("videos"),
    chargeUsd: usdString(
      shown.reduce((sum, row) => sum - usdUnits(row.chargeUsd), usdUnits(group.chargeUsd)),
    ),
    unrecordedCharges: less("unrecordedCharges"),
    ownKeyCalls: less("ownKeyCalls"),
  };
}

/**
 * A page of groups by the first detail, each with its largest groups by the second and the rest
 * as one "Other" row; a download has every group and every row under it.
 */
async function queryTable(input: AiUsageQuery) {
  const first = COLUMNS[input.groupBy];
  const thenBy = input.thenBy && input.thenBy !== input.groupBy ? input.thenBy : null;
  const second = thenBy ? COLUMNS[thenBy] : null;
  const page = input.page ?? 1;
  const offset = (page - 1) * AI_USAGE_PAGE_SIZE;
  const largestFirst = sql`sort_tokens desc, sort_media desc, sort_calls desc`;
  const shown = input.all
    ? sql`true`
    : sql`p.place > ${offset} and p.place <= ${offset + AI_USAGE_PAGE_SIZE}
        and (not p.child or p.child_place <= ${AI_USAGE_CHILD_ROWS})`;
  const result = await db.execute<TableRow>(sql`
    with ${usageRows(input, input.period.from)},
    grouped as (
      select ${first} as g1, ${second ?? sql`null::text`} as g2,
        ${second ? sql`grouping(${second}) = 0` : sql`false`} as child,
        ${measures()}, ${SORT_COLUMNS}
      from filtered
      group by ${second ? sql`grouping sets ((${first}), (${first}, ${second}))` : first}
    ),
    -- Window functions place each group and its rows; partitions treat no value as one group.
    ranked as (
      select *,
        case when not child then row_number() over (
          partition by child order by ${largestFirst}, g1 nulls last) end as own_place,
        row_number() over (partition by g1, child order by ${largestFirst}, g2 nulls last)
          as child_place,
        count(*) filter (where child) over (partition by g1) as children
      from grouped
    ),
    placed as (select *, max(own_place) over (partition by g1) as place from ranked),
    counted as (select count(*)::integer as total from grouped where not child)
    select c.total, p.g1 as key1, p.g2 as key2, p.child, p.children::integer as children,
      ${labelSql(input.groupBy, sql.raw("p.g1"), input.organizationId)} as label1,
      ${thenBy ? labelSql(thenBy, sql.raw("p.g2"), input.organizationId) : sql`null::text`} as label2,
      p.calls, p."inputTokens", p."outputTokens", p.images, p.videos, p."chargeUsd",
      p."unrecordedCharges", p."ownKeyCalls"
    from counted c left join placed p on ${shown}
    order by p.place, p.child, p.child_place
  `);
  const rows: AiUsageRow[] = [];
  const childCounts: number[] = [];
  for (const row of result.rows) {
    if (row.child === null) continue;
    if (!row.child) {
      rows.push({ key: row.key1, label: row.label1, ...totalsOf(row), children: [] });
      childCounts.push(row.children);
      continue;
    }
    rows.at(-1)?.children.push({ key: row.key2, label: row.label2, ...totalsOf(row) });
  }
  rows.forEach((row, index) => {
    if (row.children.length < childCounts[index]!)
      row.children.push({
        key: null,
        label: null,
        other: true,
        ...remainder(row, row.children),
      });
  });
  return {
    thenBy,
    rows,
    totalGroups: result.rows[0]?.total ?? 0,
    page,
    pageSize: AI_USAGE_PAGE_SIZE,
  };
}

/** The first day of each point of the period's chart: each day, or each week from its Monday. */
function chartStarts(period: ReportPeriod): string[] {
  const weekly = period.interval === "week";
  const weekday = (new Date(`${period.from}T00:00:00Z`).getUTCDay() + 6) % 7;
  const starts: string[] = [];
  for (
    let day = weekly ? addDays(period.from, -weekday) : period.from;
    day <= period.to;
    day = addDays(day, weekly ? 7 : 1)
  )
    starts.push(day);
  return starts;
}

/** Calls, tokens and charge per day or week, for the largest groups by the first detail. */
async function querySeries(input: AiUsageQuery): Promise<AiUsageSeries> {
  const column = COLUMNS[input.groupBy];
  const day = sql`(f.created_at at time zone 'UTC')::date`;
  const bucket = input.period.interval === "week" ? sql`date_trunc('week', ${day})::date` : day;
  const result = await db.execute<{
    start: string;
    slot: number;
    key: string | null;
    label: string | null;
    calls: number;
    tokens: number;
    chargeUsd: number;
  }>(sql`
    with ${usageRows(input, input.period.from)},
    ranked as (
      select ${column} as g1, (row_number() over (
        order by sort_tokens desc, sort_media desc, sort_calls desc, ${column} nulls last))::integer
        as slot
      from (select ${column}, ${SORT_COLUMNS} from filtered group by 1) t
    ),
    top as (select * from ranked where slot <= ${AI_USAGE_CHART_GROUPS})
    select ${bucket}::text as start, coalesce(t.slot, 0) as slot, t.g1 as key,
      ${labelSql(input.groupBy, sql.raw("t.g1"), input.organizationId)} as label,
      count(*) filter (where not f.media)::integer as calls,
      coalesce(sum(f.input_tokens + f.output_tokens) filter (where not f.media), 0)::float8
        as tokens,
      coalesce(sum(f.amount_usd) filter (where f.credential_source = 'gateway'), 0)::float8
        as "chargeUsd"
    from filtered f left join top t on t.g1 is not distinct from f.${column}
    group by 1, 2, 3
  `);
  // The top groups in order, then "Other" (slot 0) when some groups did not make the top.
  const slots = [...new Set(result.rows.map((row) => row.slot))].sort(
    (left, right) => (left || Infinity) - (right || Infinity),
  );
  const groups = slots.map((slot) => {
    const row = result.rows.find((candidate) => candidate.slot === slot)!;
    return slot === 0
      ? { key: null, label: null, other: true }
      : { key: row.key, label: row.label, other: false };
  });
  const position = new Map(slots.map((slot, index) => [slot, index]));
  const points = new Map(
    chartStarts(input.period).map((start) => [
      start,
      {
        start,
        calls: slots.map(() => 0),
        tokens: slots.map(() => 0),
        chargeUsd: slots.map(() => 0),
      },
    ]),
  );
  for (const row of result.rows) {
    const point = points.get(row.start);
    const index = position.get(row.slot);
    if (!point || index === undefined) continue;
    point.calls[index] = row.calls;
    point.tokens[index] = row.tokens;
    point.chargeUsd[index] = row.chargeUsd;
  }
  return { groups, points: [...points.values()] };
}

/**
 * AI used in a period, placed in projects by `attributedUsage`: headline totals, a page of the
 * table grouped by `groupBy` (then `thenBy`), and the chart. Calls tied to no project are
 * counted only when `includeUnattributed` is set and no project is chosen.
 */
export async function queryAiUsage(input: AiUsageQuery): Promise<AiUsage> {
  const automation = input.filters?.automation;
  // Three statements rather than one, so the database reads them side by side.
  const [{ totals, previous }, table, series, automationName] = await Promise.all([
    queryTotals(input),
    queryTable(input),
    querySeries(input),
    automation
      ? db
          .execute<{ name: string }>(
            sql`select name from workspace_automations
              where organization_id = ${input.organizationId} and id::text = ${automation}`,
          )
          .then((result) => result.rows[0]?.name ?? null)
      : null,
  ]);
  return {
    period: input.period,
    groupBy: input.groupBy,
    ...table,
    totals,
    previous,
    series,
    automationName,
  };
}
