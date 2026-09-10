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
import { http, HttpResponse } from "msw";

import type { LinkedDomainPublic } from "@/lib/linked-domains/types";
import {
  DOMAIN_RESEARCH_VERIFY_RECORD,
  getResearchPrototypeCatalog,
  getResearchPrototypeDomain,
  listResearchPrototypeDomains,
  type DomainResearchCatalog,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";

const NOW = "2026-09-10T00:00:00.000Z";

function linkedDomainPublic(domain: DomainResearchDomain): LinkedDomainPublic {
  const domainSlug = domain.domainSlug ?? domain.id;
  return {
    id: domain.id,
    organizationId: "11111111-1111-4111-8111-111111111111",
    domainKey: domain.domainKey,
    domainSlug,
    sourceUrl: domain.sourceUrl,
    status: domain.status,
    preferredMethod: null,
    verifiedMethod: domain.status === "verified" ? "dns_txt" : null,
    verifiedAt: domain.status === "verified" ? NOW : null,
    localisationAuditId: null,
    projectId: null,
    createdAt: NOW,
    updatedAt: NOW,
    challenges: {
      token: DOMAIN_RESEARCH_VERIFY_RECORD.value,
      dnsTxt: {
        host: DOMAIN_RESEARCH_VERIFY_RECORD.host,
        value: DOMAIN_RESEARCH_VERIFY_RECORD.value,
      },
      htmlFile: {
        path: "/.well-known/hyperlocalise-verification.txt",
        url: `${domain.sourceUrl}/.well-known/hyperlocalise-verification.txt`,
        body: DOMAIN_RESEARCH_VERIFY_RECORD.value,
      },
      metaTag: {
        html: `<meta name="hyperlocalise-site-verification" content="${DOMAIN_RESEARCH_VERIFY_RECORD.value}" />`,
      },
    },
    auditScore: domain.score,
  };
}

function withCatalogMarket<T extends { marketId?: string }>(rows: T[], marketId: string): T[] {
  return rows.map((row) => ({ ...row, marketId: row.marketId ?? marketId }));
}

export function mergedResearchCatalog(linkedDomainId: string): DomainResearchCatalog | null {
  const domain = getResearchPrototypeDomain(linkedDomainId);
  if (!domain) return null;
  const localeCatalogs = domain.locales.flatMap((locale) => {
    const catalog = getResearchPrototypeCatalog(linkedDomainId, locale.id);
    return catalog ? [catalog] : [];
  });
  const base = localeCatalogs[0] ?? getResearchPrototypeCatalog(linkedDomainId);
  if (!base) {
    return {
      domain,
      market: domain.locales[0]!,
      keywords: [],
      ranks: [],
      overviewKeywords: [],
      overviewPages: [],
      competitors: [],
      engineMentions: { chatgpt: 0, claude: 0, gemini: 0, perplexity: 0 },
      prompt: "",
      promptResults: [],
      serpByKeywordId: {},
    };
  }
  if (localeCatalogs.length <= 1) {
    return { ...base, domain };
  }
  return {
    ...base,
    domain,
    keywords: localeCatalogs.flatMap((catalog) =>
      withCatalogMarket(catalog.keywords, catalog.market.id),
    ),
    ranks: localeCatalogs.flatMap((catalog) => withCatalogMarket(catalog.ranks, catalog.market.id)),
    overviewKeywords: localeCatalogs.flatMap((catalog) => catalog.overviewKeywords),
    overviewPages: localeCatalogs.flatMap((catalog) => catalog.overviewPages),
    serpByKeywordId: Object.assign({}, ...localeCatalogs.map((catalog) => catalog.serpByKeywordId)),
  };
}

export function domainResearchMswHandlers() {
  return [
    http.get(
      "*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId/research",
      ({ params }) => {
        const linkedDomainId = String(params.linkedDomainId);
        const catalog = mergedResearchCatalog(linkedDomainId);
        if (!catalog) {
          return HttpResponse.json({ error: "linked_domain_not_found" }, { status: 404 });
        }
        return HttpResponse.json({
          catalog,
          linkedDomain: linkedDomainPublic(catalog.domain),
        });
      },
    ),
    http.get("*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId", ({ params }) => {
      const domain = getResearchPrototypeDomain(String(params.linkedDomainId));
      if (!domain) {
        return HttpResponse.json({ error: "linked_domain_not_found" }, { status: 404 });
      }
      return HttpResponse.json({ linkedDomain: linkedDomainPublic(domain) });
    }),
    http.get("*/api/orgs/:organizationSlug/linked-domains", () =>
      HttpResponse.json({
        linkedDomains: listResearchPrototypeDomains().map(linkedDomainPublic),
      }),
    ),
  ];
}

export function emptyLinkedDomainsMswHandlers() {
  return [
    http.get("*/api/orgs/:organizationSlug/linked-domains", () =>
      HttpResponse.json({ linkedDomains: [] }),
    ),
  ];
}
