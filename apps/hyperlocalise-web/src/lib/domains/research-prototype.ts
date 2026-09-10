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

export const DOMAIN_RESEARCH_SURFACES = [
  "keywords",
  "overview",
  "ranks",
  "brand",
  "prompts",
] as const;

export type DomainResearchSurface = (typeof DOMAIN_RESEARCH_SURFACES)[number];

export type DomainResearchNavId = DomainResearchSurface;

export type DomainResearchStatus = "verified" | "pending_verification";

export type KeywordIntent = "informational" | "commercial" | "transactional" | "navigational";

export type BrandEngine = "chatgpt" | "claude" | "gemini" | "perplexity";

export type BrandSentiment = "positive" | "mixed" | "negative";

export type DomainResearchMarket = {
  id: string;
  location: string;
  language: string;
  label: string;
};

export type DomainResearchDomain = {
  id: string;
  domainKey: string;
  sourceUrl: string;
  market: DomainResearchMarket;
  status: DomainResearchStatus;
  keywordCount: number;
  keywordCountLabel: string;
  traffic: number;
  trafficLabel: string;
  score: number | null;
  trackedCount: number;
  aiMentions: number;
};

export type KeywordIdea = {
  id: string;
  keyword: string;
  volume: number;
  kd: number;
  cpc: number;
  intent: KeywordIntent;
};

export type RankRow = {
  id: string;
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  url: string;
  volume: number;
};

export type OverviewKeywordRow = {
  id: string;
  keyword: string;
  position: number;
  volume: number;
  traffic: number;
};

export type OverviewPageRow = {
  id: string;
  path: string;
  keywords: number;
  traffic: number;
};

export type BrandCompetitor = {
  id: string;
  name: string;
  mentions: number;
  sentiment: BrandSentiment;
};

export type PromptEngineResult = {
  engine: BrandEngine;
  mentioned: boolean;
  excerpt: string;
};

export type SerpResult = {
  position: number;
  title: string;
  url: string;
  snippet: string;
  isOwn?: boolean;
};

export type DomainResearchCatalog = {
  domain: DomainResearchDomain;
  keywords: KeywordIdea[];
  ranks: RankRow[];
  overviewKeywords: OverviewKeywordRow[];
  overviewPages: OverviewPageRow[];
  competitors: BrandCompetitor[];
  engineMentions: Record<BrandEngine, number>;
  prompt: string;
  promptResults: PromptEngineResult[];
  serpByKeywordId: Record<string, SerpResult[]>;
};

export const DOMAIN_RESEARCH_MARKETS: DomainResearchMarket[] = [
  { id: "france-fr", location: "France", language: "fr", label: "France · fr" },
  { id: "germany-de", location: "Germany", language: "de", label: "Germany · de" },
  { id: "japan-ja", location: "Japan", language: "ja", label: "Japan · ja" },
  { id: "vietnam-vi", location: "Vietnam", language: "vi", label: "Vietnam · vi" },
];

const FRANCE_FR = DOMAIN_RESEARCH_MARKETS[0]!;
const GERMANY_DE = DOMAIN_RESEARCH_MARKETS[1]!;
const JAPAN_JA = DOMAIN_RESEARCH_MARKETS[2]!;
const VIETNAM_VI = DOMAIN_RESEARCH_MARKETS[3]!;

const HYPERLOCALISE_KEYWORDS: KeywordIdea[] = [
  {
    id: "kw-traduction-automatique",
    keyword: "traduction automatique",
    volume: 8100,
    kd: 41,
    cpc: 1.2,
    intent: "commercial",
  },
  {
    id: "kw-logiciel-de-traduction",
    keyword: "logiciel de traduction",
    volume: 5400,
    kd: 48,
    cpc: 2.1,
    intent: "commercial",
  },
  {
    id: "kw-traduire-un-site-web",
    keyword: "traduire un site web",
    volume: 3600,
    kd: 35,
    cpc: 1.8,
    intent: "commercial",
  },
  {
    id: "kw-localisation-de-logiciel",
    keyword: "localisation de logiciel",
    volume: 2900,
    kd: 39,
    cpc: 3.4,
    intent: "commercial",
  },
  {
    id: "kw-traduction-ia",
    keyword: "traduction IA",
    volume: 4400,
    kd: 44,
    cpc: 1.65,
    intent: "commercial",
  },
  {
    id: "kw-gestion-terminologique",
    keyword: "gestion terminologique",
    volume: 880,
    kd: 28,
    cpc: 4.2,
    intent: "informational",
  },
  {
    id: "kw-api-de-traduction",
    keyword: "API de traduction",
    volume: 1600,
    kd: 52,
    cpc: 5.1,
    intent: "transactional",
  },
  {
    id: "kw-memoire-de-traduction",
    keyword: "mémoire de traduction",
    volume: 2100,
    kd: 33,
    cpc: 2.8,
    intent: "informational",
  },
  {
    id: "kw-tms-traduction",
    keyword: "TMS traduction",
    volume: 720,
    kd: 31,
    cpc: 6.4,
    intent: "commercial",
  },
  {
    id: "kw-localisation-de-site-web",
    keyword: "localisation de site web",
    volume: 1900,
    kd: 37,
    cpc: 2.45,
    intent: "commercial",
  },
];

const ACME_FR_KEYWORDS: KeywordIdea[] = [
  {
    id: "kw-acme-catalogue",
    keyword: "catalogue produits France",
    volume: 2900,
    kd: 29,
    cpc: 1.1,
    intent: "commercial",
  },
  {
    id: "kw-acme-livraison",
    keyword: "livraison France",
    volume: 6600,
    kd: 46,
    cpc: 0.9,
    intent: "transactional",
  },
  {
    id: "kw-acme-support",
    keyword: "support client français",
    volume: 1200,
    kd: 22,
    cpc: 1.4,
    intent: "informational",
  },
];

const ACME_JP_KEYWORDS: KeywordIdea[] = [
  {
    id: "kw-jp-localization",
    keyword: "ソフトウェアローカライズ",
    volume: 2400,
    kd: 36,
    cpc: 3.1,
    intent: "commercial",
  },
  {
    id: "kw-jp-translation",
    keyword: "翻訳管理システム",
    volume: 1800,
    kd: 41,
    cpc: 4.6,
    intent: "commercial",
  },
  {
    id: "kw-jp-help",
    keyword: "日本語ヘルプセンター",
    volume: 980,
    kd: 24,
    cpc: 1.2,
    intent: "informational",
  },
];

const DOCS_KEYWORDS: KeywordIdea[] = [
  {
    id: "kw-vi-docs",
    keyword: "tài liệu sản phẩm tiếng Việt",
    volume: 720,
    kd: 18,
    cpc: 0.7,
    intent: "informational",
  },
  {
    id: "kw-vi-api",
    keyword: "tài liệu API",
    volume: 1600,
    kd: 27,
    cpc: 1.3,
    intent: "informational",
  },
];

const HYPERLOCALISE_SERP: SerpResult[] = [
  {
    position: 1,
    title: "Traduction automatique — Wikipédia",
    url: "https://fr.wikipedia.org/wiki/Traduction_automatique",
    snippet: "La traduction automatique est un domaine de la linguistique et de l’informatique…",
  },
  {
    position: 2,
    title: "DeepL Traduction : le meilleur traducteur au monde",
    url: "https://www.deepl.com/fr/translator",
    snippet: "Traduisez des textes et documents entiers en un instant. Qualité proche de l’humain.",
  },
  {
    position: 3,
    title: "Google Traduction",
    url: "https://translate.google.com/?hl=fr",
    snippet: "Service de traduction automatique de Google pour sites, documents et conversations.",
  },
  {
    position: 4,
    title: "SYSTRAN : solutions de traduction automatique",
    url: "https://www.systran.fr/",
    snippet: "Moteurs de traduction pour entreprises, API et workflows de localisation.",
  },
  {
    position: 22,
    title: "Hyperlocalise — localisation produit pour les équipes",
    url: "https://hyperlocalise.com/fr",
    snippet: "Recherche, traduction et publication sur le marché français, dans le même workspace.",
    isOwn: true,
  },
];

function catalogFor(
  domain: DomainResearchDomain,
  extras?: Partial<Omit<DomainResearchCatalog, "domain">>,
): DomainResearchCatalog {
  return {
    domain,
    keywords: [],
    ranks: [],
    overviewKeywords: [],
    overviewPages: [],
    competitors: [],
    engineMentions: {
      chatgpt: 0,
      claude: 0,
      gemini: 0,
      perplexity: 0,
    },
    prompt: "",
    promptResults: [],
    serpByKeywordId: {},
    ...extras,
  };
}

const RESEARCH_PROTOTYPE_CATALOG: DomainResearchCatalog[] = [
  catalogFor(
    {
      id: "hyperlocalise-com",
      domainKey: "hyperlocalise.com",
      sourceUrl: "https://hyperlocalise.com",
      market: FRANCE_FR,
      status: "verified",
      keywordCount: 12400,
      keywordCountLabel: "12.4k",
      traffic: 84000,
      trafficLabel: "84k",
      score: 82,
      trackedCount: 48,
      aiMentions: 36,
    },
    {
      keywords: HYPERLOCALISE_KEYWORDS,
      ranks: [
        {
          id: "rank-traduction-automatique",
          keyword: "traduction automatique",
          position: 22,
          previousPosition: 25,
          url: "https://hyperlocalise.com/fr",
          volume: 8100,
        },
        {
          id: "rank-logiciel-de-traduction",
          keyword: "logiciel de traduction",
          position: 8,
          previousPosition: 9,
          url: "https://hyperlocalise.com/fr/product",
          volume: 5400,
        },
        {
          id: "rank-traduction-ia",
          keyword: "traduction IA",
          position: 14,
          previousPosition: 11,
          url: "https://hyperlocalise.com/fr/blog/traduction-ia",
          volume: 4400,
        },
        {
          id: "rank-tms-traduction",
          keyword: "TMS traduction",
          position: 6,
          previousPosition: 6,
          url: "https://hyperlocalise.com/fr/product",
          volume: 720,
        },
      ],
      overviewKeywords: [
        {
          id: "ov-kw-1",
          keyword: "traduction automatique",
          position: 22,
          volume: 8100,
          traffic: 420,
        },
        {
          id: "ov-kw-2",
          keyword: "logiciel de traduction",
          position: 8,
          volume: 5400,
          traffic: 980,
        },
        {
          id: "ov-kw-3",
          keyword: "traduction IA",
          position: 14,
          volume: 4400,
          traffic: 610,
        },
        {
          id: "ov-kw-4",
          keyword: "TMS traduction",
          position: 6,
          volume: 720,
          traffic: 210,
        },
      ],
      overviewPages: [
        { id: "ov-pg-1", path: "/fr", keywords: 86, traffic: 12400 },
        { id: "ov-pg-2", path: "/fr/product", keywords: 41, traffic: 8600 },
        { id: "ov-pg-3", path: "/fr/pricing", keywords: 18, traffic: 2100 },
        { id: "ov-pg-4", path: "/fr/blog/traduction-ia", keywords: 12, traffic: 940 },
      ],
      competitors: [
        { id: "comp-phrase", name: "Phrase", mentions: 18, sentiment: "mixed" },
        { id: "comp-crowdin", name: "Crowdin", mentions: 14, sentiment: "positive" },
        { id: "comp-lokalise", name: "Lokalise", mentions: 11, sentiment: "mixed" },
        { id: "comp-smartling", name: "Smartling", mentions: 9, sentiment: "positive" },
        { id: "comp-deepl", name: "DeepL", mentions: 22, sentiment: "positive" },
      ],
      engineMentions: {
        chatgpt: 42,
        claude: 38,
        gemini: 12,
        perplexity: 29,
      },
      prompt: "meilleur outil de localisation pour une équipe produit",
      promptResults: [
        {
          engine: "chatgpt",
          mentioned: true,
          excerpt:
            "Hyperlocalise appears among tools for product teams that need research and translation in one workspace.",
        },
        {
          engine: "claude",
          mentioned: true,
          excerpt:
            "For French-market localisation, Hyperlocalise is listed next to Crowdin and Phrase for product orgs.",
        },
        {
          engine: "gemini",
          mentioned: false,
          excerpt: "Answers focus on Phrase, Crowdin, and Smartling. Hyperlocalise is not named.",
        },
        {
          engine: "perplexity",
          mentioned: true,
          excerpt:
            "Cites Hyperlocalise for domain-scoped keyword research tied to a market and language.",
        },
      ],
      serpByKeywordId: {
        "kw-traduction-automatique": HYPERLOCALISE_SERP,
      },
    },
  ),
  catalogFor(
    {
      id: "acme-fr",
      domainKey: "acme.fr",
      sourceUrl: "https://acme.fr",
      market: FRANCE_FR,
      status: "verified",
      keywordCount: 6100,
      keywordCountLabel: "6.1k",
      traffic: 29000,
      trafficLabel: "29k",
      score: 71,
      trackedCount: 22,
      aiMentions: 11,
    },
    {
      keywords: ACME_FR_KEYWORDS,
      ranks: [
        {
          id: "rank-acme-livraison",
          keyword: "livraison France",
          position: 4,
          previousPosition: 7,
          url: "https://acme.fr/livraison",
          volume: 6600,
        },
      ],
      overviewKeywords: [
        {
          id: "ov-acme-1",
          keyword: "livraison France",
          position: 4,
          volume: 6600,
          traffic: 1800,
        },
      ],
      overviewPages: [{ id: "ov-acme-home", path: "/", keywords: 54, traffic: 9100 }],
      competitors: [
        { id: "comp-fnac", name: "Fnac", mentions: 8, sentiment: "mixed" },
        { id: "comp-cdiscount", name: "Cdiscount", mentions: 6, sentiment: "negative" },
      ],
      engineMentions: {
        chatgpt: 18,
        claude: 9,
        gemini: 4,
        perplexity: 7,
      },
      prompt: "meilleure boutique acme en France",
      promptResults: [
        {
          engine: "chatgpt",
          mentioned: true,
          excerpt: "acme.fr is named as the French storefront.",
        },
        {
          engine: "claude",
          mentioned: false,
          excerpt: "Recommends marketplaces instead of the branded domain.",
        },
        {
          engine: "gemini",
          mentioned: false,
          excerpt: "No branded mention in the sampled answer.",
        },
        {
          engine: "perplexity",
          mentioned: true,
          excerpt: "Links to acme.fr for shipping and support in French.",
        },
      ],
    },
  ),
  catalogFor({
    id: "help-acme-com",
    domainKey: "help.acme.com",
    sourceUrl: "https://help.acme.com",
    market: GERMANY_DE,
    status: "pending_verification",
    keywordCount: 0,
    keywordCountLabel: "—",
    traffic: 0,
    trafficLabel: "—",
    score: null,
    trackedCount: 0,
    aiMentions: 0,
  }),
  catalogFor(
    {
      id: "acme-jp",
      domainKey: "acme.jp",
      sourceUrl: "https://acme.jp",
      market: JAPAN_JA,
      status: "verified",
      keywordCount: 8600,
      keywordCountLabel: "8.6k",
      traffic: 41000,
      trafficLabel: "41k",
      score: 77,
      trackedCount: 31,
      aiMentions: 19,
    },
    {
      keywords: ACME_JP_KEYWORDS,
      ranks: [
        {
          id: "rank-jp-tms",
          keyword: "翻訳管理システム",
          position: 11,
          previousPosition: 13,
          url: "https://acme.jp/product",
          volume: 1800,
        },
      ],
      overviewKeywords: [
        {
          id: "ov-jp-1",
          keyword: "翻訳管理システム",
          position: 11,
          volume: 1800,
          traffic: 340,
        },
      ],
      overviewPages: [{ id: "ov-jp-home", path: "/", keywords: 63, traffic: 15200 }],
      competitors: [{ id: "comp-phrase-jp", name: "Phrase", mentions: 12, sentiment: "positive" }],
      engineMentions: {
        chatgpt: 24,
        claude: 21,
        gemini: 16,
        perplexity: 14,
      },
      prompt: "日本向けのローカライズツール",
      promptResults: [
        {
          engine: "chatgpt",
          mentioned: true,
          excerpt: "acme.jp is listed for Japanese product localisation.",
        },
        {
          engine: "claude",
          mentioned: true,
          excerpt: "Names acme.jp among Japan-market localisation stacks.",
        },
        {
          engine: "gemini",
          mentioned: true,
          excerpt: "Includes acme.jp in a shortlist of JP help centers.",
        },
        {
          engine: "perplexity",
          mentioned: false,
          excerpt: "Cites Phrase and Crowdin only.",
        },
      ],
    },
  ),
  catalogFor(
    {
      id: "docs-acme-com",
      domainKey: "docs.acme.com",
      sourceUrl: "https://docs.acme.com",
      market: VIETNAM_VI,
      status: "verified",
      keywordCount: 2400,
      keywordCountLabel: "2.4k",
      traffic: 11000,
      trafficLabel: "11k",
      score: 64,
      trackedCount: 0,
      aiMentions: 4,
    },
    {
      keywords: DOCS_KEYWORDS,
      overviewKeywords: [
        {
          id: "ov-docs-1",
          keyword: "tài liệu API",
          position: 9,
          volume: 1600,
          traffic: 280,
        },
      ],
      overviewPages: [{ id: "ov-docs-home", path: "/vi", keywords: 19, traffic: 2400 }],
      competitors: [{ id: "comp-readme", name: "ReadMe", mentions: 5, sentiment: "mixed" }],
      engineMentions: {
        chatgpt: 8,
        claude: 6,
        gemini: 3,
        perplexity: 5,
      },
      prompt: "tài liệu sản phẩm tiếng Việt tốt nhất",
      promptResults: [
        {
          engine: "chatgpt",
          mentioned: false,
          excerpt: "Points to generic documentation hosts.",
        },
        {
          engine: "claude",
          mentioned: true,
          excerpt: "Mentions docs.acme.com for Vietnamese product docs.",
        },
        {
          engine: "gemini",
          mentioned: false,
          excerpt: "No branded mention.",
        },
        {
          engine: "perplexity",
          mentioned: false,
          excerpt: "No branded mention.",
        },
      ],
    },
  ),
  catalogFor({
    id: "shop-acme-de",
    domainKey: "shop.acme.de",
    sourceUrl: "https://shop.acme.de",
    market: GERMANY_DE,
    status: "pending_verification",
    keywordCount: 0,
    keywordCountLabel: "—",
    traffic: 0,
    trafficLabel: "—",
    score: null,
    trackedCount: 0,
    aiMentions: 0,
  }),
];

const RESEARCH_PROTOTYPE_BY_ID = new Map(
  RESEARCH_PROTOTYPE_CATALOG.map((entry) => [entry.domain.id, entry]),
);

export function isDomainResearchSurface(value: string): value is DomainResearchSurface {
  return (DOMAIN_RESEARCH_SURFACES as readonly string[]).includes(value);
}

export function listResearchPrototypeDomains(): DomainResearchDomain[] {
  return RESEARCH_PROTOTYPE_CATALOG.map((entry) => entry.domain);
}

export function getResearchPrototypeDomain(linkedDomainId: string): DomainResearchDomain | null {
  return RESEARCH_PROTOTYPE_BY_ID.get(linkedDomainId)?.domain ?? null;
}

export function getResearchPrototypeCatalog(linkedDomainId: string): DomainResearchCatalog | null {
  return RESEARCH_PROTOTYPE_BY_ID.get(linkedDomainId) ?? null;
}

export function isResearchPrototypeDomain(linkedDomainId: string): boolean {
  return RESEARCH_PROTOTYPE_BY_ID.has(linkedDomainId);
}

export const DOMAIN_RESEARCH_VERIFY_RECORD = {
  host: "_hyperlocalise-verify",
  type: "TXT",
  value: "hl-verify=demo",
} as const;
