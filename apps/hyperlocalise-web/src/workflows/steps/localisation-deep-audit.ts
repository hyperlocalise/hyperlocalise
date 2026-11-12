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
import { runLocalisationAuditCredits } from "@/lib/localisation-audit/credits/runner";
import { pageLocale } from "@/lib/localisation-audit/credits/shared";
import {
  buildDeepAuditFindingRecords,
  deepAuditCreditStats,
  hreflangAlternates,
  summarizeDeepAuditDiff,
  summarizeDeepAuditTemplates,
} from "@/lib/localisation-audit/deep/findings";
import { deepAuditTemplateKey, selectDeepAuditUrls } from "@/lib/localisation-audit/deep/page-set";
import {
  completeDeepAudit,
  failDeepAudit,
  findDeepAuditRunWithDomain,
  findPreviousDeepAuditFingerprints,
  getDeepAuditStatus,
  insertDeepAuditPages,
  listDeepAuditPages,
  markDeepAuditCrawling,
  markDeepAuditScoring,
  setDeepAuditPagesDiscovered,
  type DeepAuditPageInsert,
} from "@/lib/localisation-audit/deep/store";
import type { LocalisationDeepAuditSummary } from "@/lib/localisation-audit/deep/types";
import { hasLocalisationAuditSuccessfulPage } from "@/lib/localisation-audit/report-coverage";
import { aggregateLocalisationAuditCredits } from "@/lib/localisation-audit/score";
import type {
  LocalisationAuditCrawledPage,
  LocalisationAuditSitemapSignal,
} from "@/lib/localisation-audit/types";
import { LOCALISATION_AUDIT_USER_AGENT_NAME } from "@/lib/localisation-audit/user-agent";

const DEEP_AUDIT_SITEMAP_LIMITS = {
  maxLocalizedUrls: 50,
  maxNestedSitemaps: 20,
  maxSiteUrls: 5_000,
};

/** Alternates returned per batch for the second discovery pass. */
const MAX_ALTERNATES_PER_BATCH = 200;

function toPageInsert(
  requestedUrl: string,
  page: LocalisationAuditCrawledPage,
): DeepAuditPageInsert {
  return {
    url: requestedUrl,
    locale: pageLocale(page),
    templateKey: deepAuditTemplateKey(page.url),
    artifact: page,
  };
}

export async function prepareDeepAuditStep(input: { runId: string }) {
  "use step";

  const found = await findDeepAuditRunWithDomain(input.runId);
  if (!found) {
    return { ok: false as const, code: "deep_audit_not_found" as const };
  }
  if (found.run.status !== "queued") {
    return { ok: false as const, code: "deep_audit_not_queued" as const };
  }
  if (found.domain.status !== "verified") {
    await failDeepAudit({
      runId: input.runId,
      errorCode: "linked_domain_not_verified",
      errorMessage: "The domain must be verified before a deep audit can run.",
    });
    return { ok: false as const, code: "linked_domain_not_verified" as const };
  }
  if (!(await markDeepAuditCrawling(input.runId))) {
    return { ok: false as const, code: "deep_audit_not_queued" as const };
  }
  return {
    ok: true as const,
    organizationId: found.run.organizationId,
    linkedDomainId: found.run.linkedDomainId,
    sourceUrl: found.domain.sourceUrl,
    origin: new URL(found.domain.sourceUrl).origin,
    pageLimit: found.run.pageLimit,
  };
}

/**
 * Render the homepage, read robots.txt and sitemaps, and choose the page set.
 * The homepage is persisted here so it is not rendered twice.
 */
export async function discoverDeepAuditStep(input: {
  runId: string;
  organizationId: string;
  origin: string;
  sourceUrl: string;
  pageLimit: number;
}) {
  "use step";

  const [
    { collectSitemap, pageFromRendered, toAbsoluteUrl },
    { detectLocalisationAuditCrawlBlock },
  ] = await Promise.all([
    import("@/lib/localisation-audit/crawl"),
    import("@/lib/localisation-audit/crawl-block"),
  ]);
  const { createAuditPageRenderer } = await import("@/lib/localisation-audit/audit-page-renderer");

  const renderer = await createAuditPageRenderer();
  let home: LocalisationAuditCrawledPage | null = null;
  let sitemap: Awaited<ReturnType<typeof collectSitemap>>;
  try {
    const rendered = (await renderer.render([input.sourceUrl]))[0];
    if (!rendered) {
      return { ok: false as const, code: "crawl_failed" as const };
    }
    if (detectLocalisationAuditCrawlBlock(rendered.status, rendered.html)) {
      return { ok: false as const, code: "crawl_blocked" as const };
    }
    home = pageFromRendered(rendered);
    // Fetch robots.txt and sitemaps through the same browser session when it can.
    sitemap = await collectSitemap(input.origin, DEEP_AUDIT_SITEMAP_LIMITS, {
      fetchText: renderer.fetchText?.bind(renderer),
    });
  } finally {
    await renderer.close().catch(() => undefined);
  }

  const { signal, siteUrls } = sitemap;
  const homeLinks = [
    ...home.hreflang.map((entry) => entry.href),
    ...home.anchors.map((anchor) => anchor.href),
  ].flatMap((href) => {
    const absolute = toAbsoluteUrl(home!.url, href);
    return absolute ? [absolute] : [];
  });

  const urls = selectDeepAuditUrls({
    origin: input.origin,
    candidates: [...homeLinks, ...siteUrls],
    limit: Math.max(0, input.pageLimit - 1),
    exclude: [input.sourceUrl, home.url],
  });

  const stored = await insertDeepAuditPages({
    runId: input.runId,
    organizationId: input.organizationId,
    pages: [toPageInsert(input.sourceUrl, home)],
  });
  if (!stored.accepted) {
    return { ok: false as const, code: "cancelled" as const };
  }
  await setDeepAuditPagesDiscovered(input.runId, urls.length + 1);

  return { ok: true as const, urls, sitemap: signal };
}

/**
 * Render one batch in a fresh browser session and persist the pages. Stops early when
 * the run was cancelled. Returns hreflang alternates for the second pass.
 */
export async function renderDeepAuditBatchStep(input: {
  runId: string;
  organizationId: string;
  urls: string[];
}) {
  "use step";

  if ((await getDeepAuditStatus(input.runId)) !== "crawling") {
    return { cancelled: true as const, rendered: 0, blocked: 0, alternates: [] as string[] };
  }

  const [{ pageFromRendered }, { detectLocalisationAuditCrawlBlock }, { createAuditPageRenderer }] =
    await Promise.all([
      import("@/lib/localisation-audit/crawl"),
      import("@/lib/localisation-audit/crawl-block"),
      import("@/lib/localisation-audit/audit-page-renderer"),
    ]);

  const renderer = await createAuditPageRenderer();
  const inserts: DeepAuditPageInsert[] = [];
  const renderedPages: LocalisationAuditCrawledPage[] = [];
  let blocked = 0;
  try {
    for (const rendered of await renderer.render(input.urls)) {
      if (detectLocalisationAuditCrawlBlock(rendered.status, rendered.html)) {
        blocked += 1;
        continue;
      }
      const page = pageFromRendered(rendered);
      renderedPages.push(page);
      inserts.push(toPageInsert(rendered.requestedUrl, page));
    }
  } finally {
    await renderer.close().catch(() => undefined);
  }

  const stored = await insertDeepAuditPages({
    runId: input.runId,
    organizationId: input.organizationId,
    pages: inserts,
  });
  if (!stored.accepted) {
    return { cancelled: true as const, rendered: 0, blocked, alternates: [] as string[] };
  }
  return {
    cancelled: false as const,
    rendered: stored.inserted,
    blocked,
    alternates: hreflangAlternates(renderedPages).slice(0, MAX_ALTERNATES_PER_BATCH),
  };
}

/** Locale versions found through hreflang that the first pass did not reach. */
export async function planDeepAuditAlternatesStep(input: {
  origin: string;
  alternates: string[];
  attempted: string[];
  remaining: number;
}) {
  "use step";

  if (input.remaining <= 0) return { urls: [] as string[] };
  return {
    urls: selectDeepAuditUrls({
      origin: input.origin,
      candidates: input.alternates,
      limit: input.remaining,
      exclude: input.attempted,
    }),
  };
}

export async function scoreDeepAuditStep(input: {
  runId: string;
  organizationId: string;
  linkedDomainId: string;
  sitemap: LocalisationAuditSitemapSignal;
}) {
  "use step";

  if (!(await markDeepAuditScoring(input.runId))) {
    return { ok: false as const, code: "deep_audit_not_crawling" as const };
  }

  const stored = await listDeepAuditPages(input.runId);
  const byFinalUrl = new Map<string, (typeof stored)[number]>();
  for (const row of stored) {
    if (!byFinalUrl.has(row.artifact.url)) byFinalUrl.set(row.artifact.url, row);
  }
  const unique = [...byFinalUrl.values()];
  const crawledPages = unique.map((row) => row.artifact);

  if (!hasLocalisationAuditSuccessfulPage(crawledPages)) {
    await failDeepAudit({
      runId: input.runId,
      errorCode: "crawl_failed",
      errorMessage: "None of the pages loaded successfully, so the domain could not be scored.",
    });
    return { ok: false as const, code: "crawl_failed" as const };
  }

  const scored = await runLocalisationAuditCredits({
    pages: crawledPages,
    focusLocales: [],
    sitemap: input.sitemap,
    collapseFindings: false,
  });
  const { score, dimensionScores, localeCoverageFactor } = aggregateLocalisationAuditCredits(
    scored.credits,
    { localeCount: scored.detectedLocales.length },
  );

  const previous = await findPreviousDeepAuditFingerprints({
    linkedDomainId: input.linkedDomainId,
    runId: input.runId,
  });
  const records = buildDeepAuditFindingRecords({
    findings: scored.findings,
    pageLocales: new Map(unique.map((row) => [row.artifact.url, row.locale])),
    previousFingerprints: previous?.fingerprints ?? null,
  });

  const summary: LocalisationDeepAuditSummary = {
    credits: scored.credits,
    creditStats: deepAuditCreditStats(records),
    detectedLocales: scored.detectedLocales,
    localeCoverageFactor,
    templates: summarizeDeepAuditTemplates(unique),
    pagesCrawled: unique.length,
    findingsCount: records.length,
    diff: summarizeDeepAuditDiff(records, previous?.fingerprints ?? null),
    linguisticNotes: scored.linguisticNotes,
  };

  const completed = await completeDeepAudit({
    runId: input.runId,
    organizationId: input.organizationId,
    score,
    dimensionScores,
    summary,
    previousRunId: previous?.runId ?? null,
    findings: records,
  });
  if (!completed) {
    return { ok: false as const, code: "deep_audit_not_scoring" as const };
  }
  return { ok: true as const, score, findingsCount: records.length };
}

const FAILURE_MESSAGES: Record<string, string> = {
  crawl_blocked: `This domain blocked ${LOCALISATION_AUDIT_USER_AGENT_NAME}. Allow it through your firewall, CDN, bot protection, or login wall, then run the audit again.`,
  crawl_failed: "The homepage could not be loaded, so no pages were audited.",
};

export async function failDeepAuditStep(input: {
  runId: string;
  errorCode: string;
  errorMessage?: string;
}) {
  "use step";
  await failDeepAudit({
    runId: input.runId,
    errorCode: input.errorCode,
    errorMessage:
      input.errorMessage ?? FAILURE_MESSAGES[input.errorCode] ?? "The deep audit failed.",
  });
  return { ok: false as const, code: input.errorCode };
}
