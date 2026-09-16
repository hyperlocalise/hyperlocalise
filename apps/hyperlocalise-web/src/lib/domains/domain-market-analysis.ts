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
import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import { DOMAIN_RESEARCH_MARKETS } from "@/lib/domains/research-prototype";
import { resolveDomainIdentity } from "@/lib/localisation-audit/domain-slug";
import { parsePageSignals } from "@/lib/localisation-audit/html-parse";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { readBoundedResponseBody, withPublicHttpFetch } from "@/lib/security/public-http-fetch";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_HTML_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;

const aiOutputSchema = z.object({
  category: z.string().trim().nullable(),
  audience: z.string().trim().nullable(),
  businessModel: z.string().trim().nullable(),
  summary: z.string().trim().nullable(),
  classificationConfidence: z.number().min(0).max(100),
  primaryMarkets: z
    .array(
      z.object({
        marketId: z.string(),
        confidence: z.number().min(0).max(100),
        reason: z.string().trim(),
      }),
    )
    .max(8),
  potentialMarkets: z
    .array(
      z.object({
        marketId: z.string(),
        confidence: z.number().min(0).max(100),
        reason: z.string().trim(),
      }),
    )
    .max(12),
});

export type DomainMarketRecommendation = {
  marketId: string;
  confidence: number;
  reason: string;
};

export type DomainMarketAnalysisResult = {
  domainKey: string;
  classification: {
    category: string | null;
    audience: string | null;
    businessModel: string | null;
    summary: string | null;
    confidence: number;
  };
  primaryMarkets: DomainMarketRecommendation[];
  potentialMarkets: DomainMarketRecommendation[];
  analyzedAt: string;
  expiresAt: string;
};

export type DomainMarketAnalysis = DomainMarketAnalysisResult & { cached: boolean };

export type DomainMarketAnalysisError =
  | { code: "invalid_domain"; message: string }
  | { code: "homepage_unavailable"; message: string }
  | { code: "analysis_unavailable"; message: string };

async function fetchHomepage(url: string): Promise<string> {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await withPublicHttpFetch(
        currentUrl,
        { signal: controller.signal, redirect: "manual", headers: { accept: "text/html" } },
        async (result) => result,
        { maxResponseSize: MAX_HTML_BYTES },
      );

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) throw new Error("redirect_limit");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response.ok) throw new Error("homepage_status");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new Error("homepage_not_html");
      }
      return new TextDecoder().decode(await readBoundedResponseBody(response, MAX_HTML_BYTES));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("redirect_limit");
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanRecommendations(
  recommendations: Array<{ marketId: string; confidence: number; reason: string }>,
  excluded: Set<string>,
  limit: number,
) {
  const supported = new Set(DOMAIN_RESEARCH_MARKETS.map((market) => market.id));
  const seen = new Set(excluded);
  return recommendations
    .filter((item) => supported.has(item.marketId) && !seen.has(item.marketId))
    .map((item) => {
      seen.add(item.marketId);
      return {
        marketId: item.marketId,
        confidence: clampConfidence(item.confidence),
        reason: item.reason.slice(0, 180),
      };
    })
    .slice(0, limit);
}

async function inferMarkets(domainKey: string, pageUrl: string, html: string) {
  const signals = parsePageSignals(html);
  const evidence = {
    pageUrl,
    title: signals.title,
    metaDescription: signals.metaDescription,
    ogTitle: signals.ogTitle,
    ogDescription: signals.ogDescription,
    htmlLang: signals.htmlLang,
    ogLocale: signals.ogLocale,
    headings: signals.headings.slice(0, 8),
    textSample: signals.textSample.slice(0, 1_200),
  };
  const catalog = DOMAIN_RESEARCH_MARKETS.map(({ id, label, location, language }) => ({
    id,
    label,
    location,
    language,
  }));
  const { output } = await generateText({
    model: getHyperlocaliseAgentModel(),
    output: Output.object({ schema: aiOutputSchema }),
    prompt: [
      "Classify this website for localization market planning.",
      "Use only the evidence. Do not invent facts.",
      "Primary markets are the strongest evidence-based target markets.",
      "Potential markets are plausible expansion opportunities with weaker evidence.",
      "Choose market IDs only from the supplied catalog.",
      "Return concise reasons grounded in the evidence.",
      JSON.stringify({ domainKey, evidence, marketCatalog: catalog }),
    ].join("\n\n"),
  });

  const primaryMarkets = cleanRecommendations(output.primaryMarkets, new Set(), 3);
  const potentialMarkets = cleanRecommendations(
    output.potentialMarkets,
    new Set(primaryMarkets.map((market) => market.marketId)),
    5,
  );
  const analyzedAt = new Date();
  return {
    domainKey,
    classification: {
      category: output.category?.slice(0, 80) || null,
      audience: output.audience?.slice(0, 160) || null,
      businessModel: output.businessModel?.slice(0, 80) || null,
      summary: output.summary?.slice(0, 280) || null,
      confidence: clampConfidence(output.classificationConfidence),
    },
    primaryMarkets,
    potentialMarkets,
    analyzedAt: analyzedAt.toISOString(),
    expiresAt: new Date(analyzedAt.getTime() + CACHE_TTL_MS).toISOString(),
  } satisfies DomainMarketAnalysisResult;
}

export async function analyzeDomainMarkets(input: {
  domain: string;
  refresh?: boolean;
  database?: DatabaseClient;
}): Promise<Result<DomainMarketAnalysis, DomainMarketAnalysisError>> {
  const identity = resolveDomainIdentity(input.domain);
  if (isErr(identity)) {
    return err({ code: "invalid_domain", message: "Enter a public domain or URL." });
  }

  const database = input.database ?? db;
  const now = new Date();
  if (!input.refresh) {
    const [cached] = await database
      .select()
      .from(schema.domainMarketAnalysisCache)
      .where(
        and(
          eq(schema.domainMarketAnalysisCache.domainKey, identity.value.domainKey),
          gt(schema.domainMarketAnalysisCache.expiresAt, now),
        ),
      )
      .limit(1);
    if (cached) return ok({ ...cached.analysis, cached: true });
  }

  let html: string;
  try {
    html = await fetchHomepage(identity.value.sourceUrl);
  } catch {
    return err({ code: "homepage_unavailable", message: "We could not read that homepage." });
  }

  let analysis: DomainMarketAnalysisResult;
  try {
    analysis = await inferMarkets(identity.value.domainKey, identity.value.sourceUrl, html);
  } catch {
    return err({
      code: "analysis_unavailable",
      message: "Website analysis is unavailable right now.",
    });
  }

  await database
    .insert(schema.domainMarketAnalysisCache)
    .values({
      domainKey: analysis.domainKey,
      analysis,
      analyzedAt: new Date(analysis.analyzedAt),
      expiresAt: new Date(analysis.expiresAt),
    })
    .onConflictDoUpdate({
      target: schema.domainMarketAnalysisCache.domainKey,
      set: {
        analysis,
        analyzedAt: new Date(analysis.analyzedAt),
        expiresAt: new Date(analysis.expiresAt),
        updatedAt: new Date(),
      },
    });

  return ok({ ...analysis, cached: false });
}
