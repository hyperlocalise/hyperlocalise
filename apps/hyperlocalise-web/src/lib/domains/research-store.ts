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
import { desc, eq, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { DomainResearchKeywordIntent } from "@/lib/database/schema/domain-research";
import { getLinkedDomain } from "@/lib/linked-domains/claims";
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import {
  getDomainResearchProvider,
  type DomainResearchIdea,
  type DomainResearchProvider,
  type DomainResearchProviderError,
} from "./research-provider";
import {
  DOMAIN_RESEARCH_MARKETS,
  getResearchMarket,
  linkedDomainToResearchDomain,
  type DomainResearchCatalog,
  type KeywordIdea,
  type KeywordIntent,
  type RankRow,
  type SerpResult,
} from "./research-prototype";

export type DomainResearchStoreError =
  | DomainResearchProviderError
  | {
      code: "linked_domain_not_found" | "linked_domain_not_verified" | "market_not_found";
      message: string;
    };

export type DomainResearchCatalogResult = {
  catalog: DomainResearchCatalog;
  linkedDomain: LinkedDomainPublic;
};

function asIntent(value: string): KeywordIntent {
  if (
    value === "commercial" ||
    value === "transactional" ||
    value === "navigational" ||
    value === "informational"
  ) {
    return value;
  }
  return "informational";
}

function compactCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function toResearchDomain(
  linkedDomain: LinkedDomainPublic,
  stats: { keywordCount: number; trackedCount: number },
) {
  return {
    ...linkedDomainToResearchDomain(linkedDomain),
    keywordCount: stats.keywordCount,
    keywordCountLabel: stats.keywordCount > 0 ? compactCount(stats.keywordCount) : "—",
    trackedCount: stats.trackedCount,
  };
}

async function requireLinkedDomain(input: {
  organizationId: string;
  linkedDomainId: string;
  database: DatabaseClient;
  verified?: boolean;
}): Promise<Result<LinkedDomainPublic, DomainResearchStoreError>> {
  const linkedDomain = await getLinkedDomain({
    organizationId: input.organizationId,
    linkedDomainId: input.linkedDomainId,
    database: input.database,
  });
  if (!linkedDomain) {
    return err({
      code: "linked_domain_not_found",
      message: "Linked domain was not found.",
    });
  }
  if (input.verified && linkedDomain.status !== "verified") {
    return err({
      code: "linked_domain_not_verified",
      message: "Verify the domain before running research.",
    });
  }
  return ok(linkedDomain);
}

export async function getLiveDomainResearchCatalog(input: {
  organizationId: string;
  linkedDomainId: string;
  database?: DatabaseClient;
}): Promise<Result<DomainResearchCatalogResult, DomainResearchStoreError>> {
  const database = input.database ?? db;
  const linkedDomainResult = await requireLinkedDomain({
    ...input,
    database,
  });
  if (!linkedDomainResult.ok) {
    return linkedDomainResult;
  }

  const [keywordRows, trackedRows, serpRows] = await Promise.all([
    database
      .select()
      .from(schema.domainResearchKeywords)
      .where(eq(schema.domainResearchKeywords.linkedDomainId, input.linkedDomainId))
      .orderBy(desc(schema.domainResearchKeywords.volume)),
    database
      .select()
      .from(schema.domainResearchTrackedKeywords)
      .where(eq(schema.domainResearchTrackedKeywords.linkedDomainId, input.linkedDomainId))
      .orderBy(desc(schema.domainResearchTrackedKeywords.volume)),
    database
      .select()
      .from(schema.domainResearchSerpSnapshots)
      .where(eq(schema.domainResearchSerpSnapshots.linkedDomainId, input.linkedDomainId)),
  ]);

  const keywords: KeywordIdea[] = keywordRows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    volume: row.volume,
    kd: row.kd,
    cpc: row.cpc,
    intent: asIntent(row.intent),
    marketId: row.marketId,
  }));
  const ranks: RankRow[] = trackedRows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    position: row.position,
    previousPosition: row.previousPosition,
    url: row.url,
    volume: row.volume,
    marketId: row.marketId,
  }));
  const serpByKeywordId: Record<string, SerpResult[]> = {};
  const keywordIdByKey = new Map(
    keywordRows.map((row) => [
      `${row.locationCode}:${row.languageCode}:${row.keyword.toLowerCase()}`,
      row.id,
    ]),
  );
  for (const snapshot of serpRows) {
    const key = `${snapshot.locationCode}:${snapshot.languageCode}:${snapshot.keyword.toLowerCase()}`;
    const keywordId = keywordIdByKey.get(key);
    if (keywordId) {
      serpByKeywordId[keywordId] = snapshot.results;
    }
  }

  const latestMarket =
    getResearchMarket(keywordRows[0]?.marketId ?? trackedRows[0]?.marketId ?? "") ??
    DOMAIN_RESEARCH_MARKETS[0]!;
  const domain = {
    ...toResearchDomain(linkedDomainResult.value, {
      keywordCount: keywords.length,
      trackedCount: ranks.length,
    }),
    market: latestMarket,
  };

  return ok({
    linkedDomain: linkedDomainResult.value,
    catalog: {
      domain,
      keywords,
      ranks,
      overviewKeywords: ranks.flatMap((row) =>
        row.position == null
          ? []
          : [
              {
                id: row.id,
                keyword: row.keyword,
                position: row.position,
                volume: row.volume,
                traffic: 0,
              },
            ],
      ),
      overviewPages: ranks
        .filter((row) => row.url)
        .reduce<DomainResearchCatalog["overviewPages"]>((pages, row) => {
          let path = row.url;
          try {
            path = new URL(row.url).pathname || "/";
          } catch {
            path = row.url;
          }
          const existing = pages.find((page) => page.path === path);
          if (existing) {
            existing.keywords += 1;
            return pages;
          }
          pages.push({ id: row.id, path, keywords: 1, traffic: 0 });
          return pages;
        }, []),
      competitors: [],
      engineMentions: { chatgpt: 0, claude: 0, gemini: 0, perplexity: 0 },
      prompt: "",
      promptResults: [],
      serpByKeywordId,
    },
  });
}

export async function expandLiveDomainKeywords(input: {
  organizationId: string;
  linkedDomainId: string;
  seedKeyword: string;
  marketId: string;
  cookie?: string;
  signal?: AbortSignal;
  provider?: DomainResearchProvider;
  database?: DatabaseClient;
}): Promise<Result<{ ideas: KeywordIdea[]; marketId: string }, DomainResearchStoreError>> {
  const database = input.database ?? db;
  const linkedDomainResult = await requireLinkedDomain({
    ...input,
    database,
    verified: true,
  });
  if (!linkedDomainResult.ok) {
    return linkedDomainResult;
  }
  const market = getResearchMarket(input.marketId);
  if (!market) {
    return err({ code: "market_not_found", message: "Unknown research market." });
  }

  const provider = input.provider ?? getDomainResearchProvider();
  const result = await provider.expandKeywordIdeas({
    keyword: input.seedKeyword,
    locationCode: market.locationCode,
    languageCode: market.language,
    cookie: input.cookie,
    signal: input.signal,
  });
  if (!result.ok) {
    return result;
  }

  return ok({
    marketId: market.id,
    ideas: result.value.map((idea) => ({
      id: `idea:${market.locationCode}:${market.language}:${idea.keyword.toLowerCase()}`,
      keyword: idea.keyword,
      volume: idea.volume,
      kd: idea.kd,
      cpc: idea.cpc,
      intent: idea.intent,
      marketId: market.id,
    })),
  });
}

export async function saveLiveDomainKeywords(input: {
  organizationId: string;
  linkedDomainId: string;
  marketId: string;
  seedKeyword?: string;
  keywords: DomainResearchIdea[];
  database?: DatabaseClient;
}): Promise<Result<{ keywords: KeywordIdea[] }, DomainResearchStoreError>> {
  const database = input.database ?? db;
  const linkedDomainResult = await requireLinkedDomain({
    ...input,
    database,
    verified: true,
  });
  if (!linkedDomainResult.ok) {
    return linkedDomainResult;
  }
  const market = getResearchMarket(input.marketId);
  if (!market) {
    return err({ code: "market_not_found", message: "Unknown research market." });
  }

  const unique = new Map<string, DomainResearchIdea>();
  for (const keyword of input.keywords) {
    const normalized = keyword.keyword.trim();
    if (!normalized) {
      continue;
    }
    unique.set(normalized.toLowerCase(), { ...keyword, keyword: normalized });
  }
  const rows = [...unique.values()];
  if (rows.length === 0) {
    return ok({ keywords: [] });
  }

  await database
    .insert(schema.domainResearchKeywords)
    .values(
      rows.map((keyword) => ({
        organizationId: input.organizationId,
        linkedDomainId: input.linkedDomainId,
        keyword: keyword.keyword,
        seedKeyword: input.seedKeyword?.trim() || null,
        marketId: market.id,
        locationCode: market.locationCode,
        languageCode: market.language,
        volume: keyword.volume,
        kd: keyword.kd,
        cpc: keyword.cpc,
        intent: keyword.intent as DomainResearchKeywordIntent,
      })),
    )
    .onConflictDoUpdate({
      target: [
        schema.domainResearchKeywords.linkedDomainId,
        schema.domainResearchKeywords.locationCode,
        schema.domainResearchKeywords.languageCode,
        schema.domainResearchKeywords.keyword,
      ],
      set: {
        volume: sql`excluded.volume`,
        kd: sql`excluded.kd`,
        cpc: sql`excluded.cpc`,
        intent: sql`excluded.intent`,
        seedKeyword: sql`excluded.seed_keyword`,
        marketId: sql`excluded.market_id`,
        updatedAt: sql`now()`,
      },
    });

  const catalog = await getLiveDomainResearchCatalog({
    organizationId: input.organizationId,
    linkedDomainId: input.linkedDomainId,
    database,
  });
  if (!catalog.ok) {
    return catalog;
  }
  return ok({ keywords: catalog.value.catalog.keywords });
}

export async function inspectLiveDomainSerp(input: {
  organizationId: string;
  linkedDomainId: string;
  keyword: string;
  marketId: string;
  cookie?: string;
  signal?: AbortSignal;
  provider?: DomainResearchProvider;
  database?: DatabaseClient;
}): Promise<Result<{ results: SerpResult[] }, DomainResearchStoreError>> {
  const database = input.database ?? db;
  const linkedDomainResult = await requireLinkedDomain({
    ...input,
    database,
    verified: true,
  });
  if (!linkedDomainResult.ok) {
    return linkedDomainResult;
  }
  const market = getResearchMarket(input.marketId);
  if (!market) {
    return err({ code: "market_not_found", message: "Unknown research market." });
  }

  const keyword = input.keyword.trim();
  const provider = input.provider ?? getDomainResearchProvider();
  const result = await provider.liveSerp({
    keyword,
    locationCode: market.locationCode,
    languageCode: market.language,
    targetDomain: linkedDomainResult.value.domainKey,
    cookie: input.cookie,
    signal: input.signal,
  });
  if (!result.ok) {
    return result;
  }

  await database
    .insert(schema.domainResearchSerpSnapshots)
    .values({
      organizationId: input.organizationId,
      linkedDomainId: input.linkedDomainId,
      keyword,
      locationCode: market.locationCode,
      languageCode: market.language,
      results: result.value,
      capturedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.domainResearchSerpSnapshots.linkedDomainId,
        schema.domainResearchSerpSnapshots.locationCode,
        schema.domainResearchSerpSnapshots.languageCode,
        schema.domainResearchSerpSnapshots.keyword,
      ],
      set: {
        results: sql`excluded.results`,
        capturedAt: sql`excluded.captured_at`,
      },
    });

  return ok({ results: result.value });
}

export async function trackLiveDomainKeywords(input: {
  organizationId: string;
  linkedDomainId: string;
  marketId: string;
  keywords: DomainResearchIdea[];
  cookie?: string;
  signal?: AbortSignal;
  provider?: DomainResearchProvider;
  database?: DatabaseClient;
}): Promise<Result<{ ranks: RankRow[] }, DomainResearchStoreError>> {
  const database = input.database ?? db;
  const linkedDomainResult = await requireLinkedDomain({
    ...input,
    database,
    verified: true,
  });
  if (!linkedDomainResult.ok) {
    return linkedDomainResult;
  }
  const market = getResearchMarket(input.marketId);
  if (!market) {
    return err({ code: "market_not_found", message: "Unknown research market." });
  }

  const unique = new Map<string, DomainResearchIdea>();
  for (const keyword of input.keywords) {
    const normalized = keyword.keyword.trim();
    if (!normalized) {
      continue;
    }
    unique.set(normalized.toLowerCase(), { ...keyword, keyword: normalized });
  }
  const rows = [...unique.values()];
  if (rows.length === 0) {
    const catalog = await getLiveDomainResearchCatalog(input);
    if (!catalog.ok) {
      return catalog;
    }
    return ok({ ranks: catalog.value.catalog.ranks });
  }

  const provider = input.provider ?? getDomainResearchProvider();
  const rankResult = await provider.rankCheckBatch({
    targetDomain: linkedDomainResult.value.domainKey,
    locationCode: market.locationCode,
    languageCode: market.language,
    keywords: rows.slice(0, 20).map((row) => ({
      keywordId: row.keyword,
      keyword: row.keyword,
    })),
    cookie: input.cookie,
    signal: input.signal,
  });
  if (!rankResult.ok) {
    return rankResult;
  }

  const checkByKeyword = new Map(
    rankResult.value.map((check) => [check.keyword.toLowerCase(), check]),
  );
  const checkedAt = new Date();
  const tracked = await database
    .insert(schema.domainResearchTrackedKeywords)
    .values(
      rows.map((keyword) => {
        const check = checkByKeyword.get(keyword.keyword.toLowerCase());
        return {
          organizationId: input.organizationId,
          linkedDomainId: input.linkedDomainId,
          keyword: keyword.keyword,
          marketId: market.id,
          locationCode: market.locationCode,
          languageCode: market.language,
          volume: keyword.volume,
          position: check?.position ?? null,
          url: check?.url ?? "",
          lastCheckedAt: check ? checkedAt : null,
        };
      }),
    )
    .onConflictDoUpdate({
      target: [
        schema.domainResearchTrackedKeywords.linkedDomainId,
        schema.domainResearchTrackedKeywords.locationCode,
        schema.domainResearchTrackedKeywords.languageCode,
        schema.domainResearchTrackedKeywords.keyword,
        schema.domainResearchTrackedKeywords.device,
      ],
      set: {
        volume: sql`excluded.volume`,
        marketId: sql`excluded.market_id`,
        previousPosition: sql`${schema.domainResearchTrackedKeywords.position}`,
        position: sql`excluded.position`,
        url: sql`excluded.url`,
        lastCheckedAt: sql`excluded.last_checked_at`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  await applyRankChecks({
    database,
    checks: tracked.flatMap((row) => {
      const check = checkByKeyword.get(row.keyword.toLowerCase());
      return check
        ? [
            {
              keywordId: row.id,
              keyword: row.keyword,
              position: check.position,
              url: check.url,
            },
          ]
        : [];
    }),
    updateTracked: false,
  });

  const catalog = await getLiveDomainResearchCatalog({
    organizationId: input.organizationId,
    linkedDomainId: input.linkedDomainId,
    database,
  });
  if (!catalog.ok) {
    return catalog;
  }
  return ok({ ranks: catalog.value.catalog.ranks });
}

export async function refreshLiveDomainRanks(input: {
  organizationId: string;
  linkedDomainId: string;
  cookie?: string;
  signal?: AbortSignal;
  provider?: DomainResearchProvider;
  database?: DatabaseClient;
}): Promise<Result<{ ranks: RankRow[] }, DomainResearchStoreError>> {
  const database = input.database ?? db;
  const linkedDomainResult = await requireLinkedDomain({
    ...input,
    database,
    verified: true,
  });
  if (!linkedDomainResult.ok) {
    return linkedDomainResult;
  }

  const tracked = await database
    .select()
    .from(schema.domainResearchTrackedKeywords)
    .where(eq(schema.domainResearchTrackedKeywords.linkedDomainId, input.linkedDomainId))
    .orderBy(desc(schema.domainResearchTrackedKeywords.updatedAt));

  if (tracked.length === 0) {
    return ok({ ranks: [] });
  }

  const groups = new Map<string, typeof tracked>();
  for (const row of tracked) {
    const key = `${row.locationCode}:${row.languageCode}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const provider = input.provider ?? getDomainResearchProvider();
  const checks: { keywordId: string; keyword: string; position: number | null; url: string }[] = [];
  for (const group of groups.values()) {
    const locationCode = group[0]!.locationCode;
    const languageCode = group[0]!.languageCode;
    for (let offset = 0; offset < group.length; offset += 20) {
      const batch = group.slice(offset, offset + 20);
      const rankResult = await provider.rankCheckBatch({
        targetDomain: linkedDomainResult.value.domainKey,
        locationCode,
        languageCode,
        keywords: batch.map((row) => ({
          keywordId: row.id,
          keyword: row.keyword,
        })),
        cookie: input.cookie,
        signal: input.signal,
      });
      if (!rankResult.ok) {
        return rankResult;
      }
      checks.push(...rankResult.value);
    }
  }
  await applyRankChecks({
    database,
    checks,
  });

  const catalog = await getLiveDomainResearchCatalog({
    organizationId: input.organizationId,
    linkedDomainId: input.linkedDomainId,
    database,
  });
  if (!catalog.ok) {
    return catalog;
  }
  return ok({ ranks: catalog.value.catalog.ranks });
}

async function applyRankChecks(input: {
  database: DatabaseClient;
  checks: { keywordId: string; keyword: string; position: number | null; url: string }[];
  updateTracked?: boolean;
}) {
  for (const check of input.checks) {
    if (!check.keywordId) {
      continue;
    }
    const [current] = await input.database
      .select()
      .from(schema.domainResearchTrackedKeywords)
      .where(eq(schema.domainResearchTrackedKeywords.id, check.keywordId))
      .limit(1);
    if (!current) {
      continue;
    }

    if (input.updateTracked !== false) {
      await input.database
        .update(schema.domainResearchTrackedKeywords)
        .set({
          previousPosition: current.position,
          position: check.position,
          url: check.url,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.domainResearchTrackedKeywords.id, check.keywordId));
    }

    await input.database.insert(schema.domainResearchRankSnapshots).values({
      trackedKeywordId: check.keywordId,
      position: check.position,
      url: check.url,
    });
  }
}
