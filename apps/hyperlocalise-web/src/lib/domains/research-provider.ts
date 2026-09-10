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
import { createHmac } from "node:crypto";

import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import type { KeywordIntent, SerpResult } from "./research-prototype";

export type DomainResearchProviderError = {
  code:
    | "provider_unavailable"
    | "provider_not_configured"
    | "provider_rate_limited"
    | "provider_validation_failed"
    | "provider_failed";
  message: string;
};

export type DomainResearchIdea = {
  keyword: string;
  volume: number;
  kd: number;
  cpc: number;
  intent: KeywordIntent;
};

export type DomainResearchRankCheck = {
  keywordId: string;
  keyword: string;
  position: number | null;
  url: string;
};

export type DomainResearchProvider = {
  expandKeywordIdeas(input: {
    keyword: string;
    locationCode: number;
    languageCode: string;
    limit?: number;
    cookie?: string;
    signal?: AbortSignal;
  }): Promise<Result<DomainResearchIdea[], DomainResearchProviderError>>;
  liveSerp(input: {
    keyword: string;
    locationCode: number;
    languageCode: string;
    targetDomain?: string;
    cookie?: string;
    signal?: AbortSignal;
  }): Promise<Result<SerpResult[], DomainResearchProviderError>>;
  rankCheck(input: {
    keywordId: string;
    keyword: string;
    targetDomain: string;
    locationCode: number;
    languageCode: string;
    cookie?: string;
    signal?: AbortSignal;
  }): Promise<Result<DomainResearchRankCheck, DomainResearchProviderError>>;
  rankCheckBatch(input: {
    targetDomain: string;
    locationCode: number;
    languageCode: string;
    keywords: { keywordId: string; keyword: string }[];
    cookie?: string;
    signal?: AbortSignal;
  }): Promise<Result<DomainResearchRankCheck[], DomainResearchProviderError>>;
};

type GoSvcErrorBody = {
  error?: string;
  message?: string;
};

function goSvcBaseUrl() {
  return (env.GO_SVC_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
}

function mapProviderError(status: number, body: GoSvcErrorBody): DomainResearchProviderError {
  if (status === 503 || body.error === "dataforseo_not_configured") {
    return {
      code: "provider_not_configured",
      message: body.message || "DataForSEO is not configured.",
    };
  }
  if (status === 429 || body.error === "dataforseo_rate_limited") {
    return {
      code: "provider_rate_limited",
      message: body.message || "DataForSEO rate limited the request.",
    };
  }
  if (status === 400 || body.error === "dataforseo_validation_error") {
    return {
      code: "provider_validation_failed",
      message: body.message || "DataForSEO rejected the request.",
    };
  }
  return {
    code: "provider_failed",
    message: body.message || "DataForSEO request failed.",
  };
}

function goSvcResearchToken() {
  return createHmac("sha256", env.WORKOS_COOKIE_PASSWORD ?? "")
    .update("go-svc-research")
    .digest("hex");
}

async function postGoSvc<T>(
  path: string,
  body: unknown,
  options: { cookie?: string; signal?: AbortSignal },
): Promise<Result<T, DomainResearchProviderError>> {
  try {
    const response = await fetch(`${goSvcBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Go-Svc-Research-Token": goSvcResearchToken(),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & GoSvcErrorBody;
    if (!response.ok) {
      return err(mapProviderError(response.status, payload));
    }
    return ok(payload);
  } catch {
    return err({
      code: "provider_unavailable",
      message: "The DataForSEO service is unavailable.",
    });
  }
}

const INTENT_VALUES = new Set<KeywordIntent>([
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);

function asIntent(value: string | undefined): KeywordIntent {
  if (value && INTENT_VALUES.has(value as KeywordIntent)) {
    return value as KeywordIntent;
  }
  return "informational";
}

export function createGoSvcDomainResearchProvider(): DomainResearchProvider {
  return {
    async expandKeywordIdeas(input) {
      const result = await postGoSvc<{
        keywords?: Array<{
          keyword?: string;
          volume?: number;
          kd?: number;
          cpc?: number;
          intent?: string;
        }>;
      }>(
        "/v1/domains/research/keywords",
        {
          keyword: input.keyword,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          limit: input.limit,
        },
        input,
      );
      if (!result.ok) {
        return result;
      }
      return ok(
        (result.value.keywords ?? [])
          .map((row) => ({
            keyword: row.keyword?.trim() ?? "",
            volume: row.volume ?? 0,
            kd: row.kd ?? 0,
            cpc: row.cpc ?? 0,
            intent: asIntent(row.intent),
          }))
          .filter((row) => row.keyword.length > 0),
      );
    },
    async liveSerp(input) {
      const result = await postGoSvc<{
        results?: Array<{
          position?: number;
          title?: string;
          url?: string;
          snippet?: string;
          isOwn?: boolean;
        }>;
      }>(
        "/v1/domains/research/serp",
        {
          keyword: input.keyword,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          targetDomain: input.targetDomain,
        },
        input,
      );
      if (!result.ok) {
        return result;
      }
      return ok(
        (result.value.results ?? [])
          .filter((row) => typeof row.position === "number" && Boolean(row.url))
          .map((row) => ({
            position: row.position as number,
            title: row.title ?? "",
            url: row.url as string,
            snippet: row.snippet ?? "",
            isOwn: row.isOwn,
          })),
      );
    },
    async rankCheck(input) {
      const result = await postGoSvc<{
        result?: {
          keywordId?: string;
          keyword?: string;
          position?: number | null;
          url?: string;
        };
      }>(
        "/v1/domains/research/rank-check",
        {
          keywordId: input.keywordId,
          keyword: input.keyword,
          targetDomain: input.targetDomain,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
        },
        input,
      );
      if (!result.ok) {
        return result;
      }
      return ok({
        keywordId: result.value.result?.keywordId || input.keywordId,
        keyword: result.value.result?.keyword || input.keyword,
        position: result.value.result?.position ?? null,
        url: result.value.result?.url ?? "",
      });
    },
    async rankCheckBatch(input) {
      const result = await postGoSvc<{
        results?: Array<{
          keywordId?: string;
          keyword?: string;
          position?: number | null;
          url?: string;
        }>;
      }>(
        "/v1/domains/research/rank-check/batch",
        {
          targetDomain: input.targetDomain,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          keywords: input.keywords,
        },
        input,
      );
      if (!result.ok) {
        return result;
      }
      return ok(
        (result.value.results ?? []).map((row, index) => ({
          keywordId: row.keywordId || input.keywords[index]?.keywordId || "",
          keyword: row.keyword || input.keywords[index]?.keyword || "",
          position: row.position ?? null,
          url: row.url ?? "",
        })),
      );
    },
  };
}

let activeProvider: DomainResearchProvider = createGoSvcDomainResearchProvider();

export function getDomainResearchProvider(): DomainResearchProvider {
  return activeProvider;
}

export function setDomainResearchProviderForTests(provider: DomainResearchProvider) {
  activeProvider = provider;
}

export function resetDomainResearchProviderForTests() {
  activeProvider = createGoSvcDomainResearchProvider();
}
