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
import { sql } from "drizzle-orm";

import { db } from "@/lib/database/client";

import { attributedUsage } from "./ai-attribution";
import {
  AI_IMAGE_SOURCES,
  AI_ORIGINS,
  AI_VIDEO_SOURCES,
  aiChannel,
  aiOrigin,
  type AiChannel,
  type AiOrigin,
} from "./ai-usage-origins";
import type { ReportPeriod } from "./report-period";
import { dayEnd, dayStart, idList, scopedProjectIds, type ReportScope } from "./report-scope";

/**
 * AI usage for the Reports page, from billing's records (`usage_events`): tokens, calls, images
 * and videos, by where the AI was called and by model. Tokens only, never money: calls on the
 * workspace's own provider key count the same as calls through our gateway.
 */

type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  videos: number;
};

export type AiUsageByOrigin = UsageTotals & {
  origin: AiOrigin;
  models: string[];
  channels: AiChannel[];
};

export type AiUsageByModel = UsageTotals & { model: string; origins: AiOrigin[] };

export type AiUsage = {
  byOrigin: AiUsageByOrigin[];
  byModel: AiUsageByModel[];
  totals: UsageTotals;
};

/** A token count from a usage row's dimensions; anything that is not a number counts as 0. */
function tokens(key: "input_tokens" | "output_tokens") {
  const value = sql.raw(`u.dimensions ->> '${key}'`);
  return sql`case when ${value} ~ '^[0-9]+([.][0-9]+)?$' then (${value})::numeric else 0 end`;
}

/**
 * AI used in a period, placed in projects by `attributedUsage`. Calls tied to no project are
 * counted only when `includeUnattributed` is set and no project is chosen.
 */
export async function queryAiUsage(
  input: Omit<ReportScope, "jobIds" | "targetLocale"> & {
    period: ReportPeriod;
    includeUnattributed: boolean;
  },
): Promise<AiUsage> {
  const projectIds = scopedProjectIds(input);
  const attributed = projectIds.length ? sql`project_id in (${idList(projectIds)})` : sql`false`;
  const projects =
    input.includeUnattributed && !input.projectId
      ? sql`(${attributed} or project_id is null)`
      : attributed;
  const media = [...AI_IMAGE_SOURCES, ...AI_VIDEO_SOURCES];
  const result = await db.execute<{
    source: string;
    agentRunKind: string | null;
    model: string | null;
    viaApiKey: boolean;
    media: boolean;
    calls: number;
    inputTokens: number;
    outputTokens: number;
  }>(sql`
    with calls as (
      select feature_id, model_id, source, agent_run_kind, via_api_key, project_id,
        ${tokens("input_tokens")} as input_tokens,
        ${tokens("output_tokens")} as output_tokens
      from (${attributedUsage({
        organizationId: input.organizationId,
        where: sql`u.created_at >= ${dayStart(input.period.from)}
          and u.created_at < ${dayEnd(input.period.to)}
          and u.status <> 'rejected'
          and (u.feature_id = 'ai_tokens'
            or (u.feature_id = 'agent_runs' and u.source in (${idList(media)})))`,
      })}) u
    )
    select source, agent_run_kind as "agentRunKind", model_id as model, via_api_key as "viaApiKey",
      feature_id = 'agent_runs' as media, count(*)::integer as calls,
      sum(input_tokens)::float8 as "inputTokens", sum(output_tokens)::float8 as "outputTokens"
    from calls where ${projects}
    group by 1, 2, 3, 4, 5
  `);
  const origins = new Map<
    AiOrigin,
    AiUsageByOrigin & { modelSet: Set<string>; channelSet: Set<AiChannel> }
  >();
  const models = new Map<string, AiUsageByModel & { originSet: Set<AiOrigin> }>();
  const totals: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, images: 0, videos: 0 };
  const images = new Set<string>(AI_IMAGE_SOURCES);
  for (const row of result.rows) {
    const origin = aiOrigin(row.source, row.agentRunKind);
    const counts: UsageTotals = row.media
      ? {
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          images: images.has(row.source) ? row.calls : 0,
          videos: images.has(row.source) ? 0 : row.calls,
        }
      : {
          calls: row.calls,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          images: 0,
          videos: 0,
        };
    let byOrigin = origins.get(origin);
    if (!byOrigin) {
      byOrigin = {
        origin,
        ...zero(),
        models: [],
        channels: [],
        modelSet: new Set(),
        channelSet: new Set(),
      };
      origins.set(origin, byOrigin);
    }
    add(byOrigin, counts);
    add(totals, counts);
    byOrigin.channelSet.add(aiChannel(row.source, row.viaApiKey));
    if (row.model) {
      byOrigin.modelSet.add(row.model);
      let byModel = models.get(row.model);
      if (!byModel) {
        byModel = { model: row.model, ...zero(), origins: [], originSet: new Set() };
        models.set(row.model, byModel);
      }
      add(byModel, counts);
      byModel.originSet.add(origin);
    }
  }
  return {
    byOrigin: [...origins.values()]
      .sort((left, right) => AI_ORIGINS.indexOf(left.origin) - AI_ORIGINS.indexOf(right.origin))
      .map(({ modelSet, channelSet, ...row }) => ({
        ...row,
        models: [...modelSet].sort(),
        channels: [...channelSet].sort(),
      })),
    byModel: [...models.values()]
      .sort(
        (left, right) =>
          right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens) ||
          left.model.localeCompare(right.model),
      )
      .map(({ originSet, ...row }) => ({
        ...row,
        origins: AI_ORIGINS.filter((origin) => originSet.has(origin)),
      })),
    totals,
  };
}

function zero(): UsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, images: 0, videos: 0 };
}

function add(target: UsageTotals, counts: UsageTotals) {
  target.calls += counts.calls;
  target.inputTokens += counts.inputTokens;
  target.outputTokens += counts.outputTokens;
  target.images += counts.images;
  target.videos += counts.videos;
}
