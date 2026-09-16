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

import {
  getDomainResearchProvider,
  type DomainMarketVisibility,
  type DomainResearchProviderError,
} from "./research-provider";
import { DOMAIN_RESEARCH_MARKETS } from "./research-prototype";
import { resolveDomainIdentity } from "@/lib/localisation-audit/domain-slug";
import { parsePageSignals } from "@/lib/localisation-audit/html-parse";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { readBoundedResponseBody, withPublicHttpFetch } from "@/lib/security/public-http-fetch";

const MAX_HTML_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_MARKET_IDS = ["france-fr", "germany-de", "japan-ja", "vietnam-vi"] as const;

export type DomainMarketRecommendations = {
  candidates: DomainMarketVisibility[];
  recommended: DomainMarketVisibility[];
};

async function fetchHomepage(url: string): Promise<string> {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const result = await withPublicHttpFetch(
        currentUrl,
        { signal: controller.signal, redirect: "manual", headers: { accept: "text/html" } },
        async (response) => {
          if (response.status >= 300 && response.status < 400) {
            return { kind: "redirect" as const, location: response.headers.get("location") };
          }
          if (!response.ok) throw new Error("homepage_status");
          return {
            kind: "body" as const,
            bytes: await readBoundedResponseBody(response, MAX_HTML_BYTES),
          };
        },
        { maxResponseSize: MAX_HTML_BYTES },
      );
      if (result.kind === "redirect") {
        const location = result.location;
        if (!location || redirectCount === MAX_REDIRECTS) throw new Error("redirect_limit");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      return new TextDecoder().decode(result.bytes);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("redirect_limit");
}

function localeLanguage(locale: string | null | undefined): string | null {
  const normalized = locale?.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized || normalized === "x-default") return null;
  const language = normalized.split("-")[0];
  return language && /^[a-z]{2,3}$/.test(language) ? language : null;
}

export async function recommendDomainMarkets(input: {
  domain: string;
  cookie?: string;
  signal?: AbortSignal;
}): Promise<
  Result<
    DomainMarketRecommendations,
    { code: "invalid_domain"; message: string } | DomainResearchProviderError
  >
> {
  const identity = resolveDomainIdentity(input.domain);
  if (!identity.ok) {
    return err({ code: "invalid_domain", message: "Enter a public domain or URL." });
  }

  let signals = null;
  try {
    signals = parsePageSignals(await fetchHomepage(identity.value.sourceUrl));
  } catch {
    // Metadata is only a candidate hint. The defaults are still analyzed.
  }

  const languages = new Set<string>();
  if (signals) {
    for (const locale of [signals.htmlLang, signals.ogLocale]) {
      const language = localeLanguage(locale);
      if (language) languages.add(language);
    }
    for (const entry of signals.hreflang) {
      const language = localeLanguage(entry.locale);
      if (language) languages.add(language);
    }
  }

  const marketIds = new Set<string>(DEFAULT_MARKET_IDS);
  for (const market of DOMAIN_RESEARCH_MARKETS) {
    if (languages.has(market.language)) marketIds.add(market.id);
  }
  const markets = DOMAIN_RESEARCH_MARKETS.filter((market) => marketIds.has(market.id));
  const provider = getDomainResearchProvider();
  const results = await mapWithConcurrency(markets, 4, async (market) =>
    provider.marketVisibility({
      targetDomain: identity.value.domainKey,
      marketId: market.id,
      locationCode: market.locationCode,
      languageCode: market.language,
      cookie: input.cookie,
      signal: input.signal,
    }),
  );
  const successful: DomainMarketVisibility[] = [];
  let failure: DomainResearchProviderError | null = null;
  for (const result of results) {
    if (result.ok) {
      successful.push(result.value);
    } else if (!failure) {
      failure = result.error;
    }
  }
  if (successful.length === 0) {
    return err(failure ?? { code: "provider_failed", message: "Market research failed." });
  }

  const candidates = successful.toSorted(
    (a, b) => b.organicEtv - a.organicEtv || b.organicCount - a.organicCount,
  );
  return ok({
    candidates,
    recommended: candidates.filter((market) => market.hasOrganicVisibility),
  });
}
