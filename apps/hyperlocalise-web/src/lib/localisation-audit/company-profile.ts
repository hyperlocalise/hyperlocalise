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
import { generateText, Output } from "ai";
import { z } from "zod";

import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";

import type { LocalisationAuditCompanyProfile, LocalisationAuditCrawledPage } from "./types";
import { emptyCrawledPage } from "./types";

const logger = createLogger("localisation-audit-company-profile");

const companyProfileOutputSchema = z.object({
  name: z.string().trim().nullable(),
  productSummary: z.string().trim().nullable(),
  brandVoice: z.string().trim().nullable(),
  industry: z.string().trim().nullable(),
  confidence: z.number().min(0).max(100),
});

export type CompanyProfileEvidence = {
  domainKey: string;
  pageUrl: string;
  title: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  headings: string[];
  textSample: string;
  logoUrl: string | null;
};

function resolveAbsoluteHttpUrl(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }
  try {
    const absolute = new URL(trimmed, baseUrl);
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") {
      return null;
    }
    return absolute.toString();
  } catch {
    return null;
  }
}

function scoreIconHref(href: string): number {
  const lower = href.toLowerCase();
  let score = 0;
  if (lower.includes("apple-touch")) score += 40;
  if (lower.includes("android-chrome")) score += 30;
  if (lower.includes("192") || lower.includes("180") || lower.includes("512")) score += 20;
  if (lower.includes("32") || lower.includes("16")) score -= 10;
  if (lower.endsWith(".svg")) score += 15;
  if (lower.includes("favicon")) score += 5;
  return score;
}

/** Prefer apple-touch / large icons, then generic icons, then OG image. */
export function pickCompanyLogoUrl(page: LocalisationAuditCrawledPage): string | null {
  const ranked = page.iconHrefs
    .map((href) => ({
      href,
      absolute: resolveAbsoluteHttpUrl(href, page.url),
      score: scoreIconHref(href),
    }))
    .filter((entry): entry is { href: string; absolute: string; score: number } =>
      Boolean(entry.absolute),
    )
    .toSorted((a, b) => b.score - a.score);

  if (ranked[0]?.absolute) {
    return ranked[0].absolute;
  }

  if (page.ogImage) {
    return resolveAbsoluteHttpUrl(page.ogImage, page.url);
  }

  return null;
}

function stripTitleNoise(title: string | null): string | null {
  if (!title) return null;
  // Split on title separators (|, en/em dash) or spaced ASCII hyphens (" - ").
  // Do not split on bare hyphens so names like "Coca-Cola" stay intact.
  const cleaned = title
    .split(/\s*[|\u2013\u2014]\s*|\s+-\s+/)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function heuristicName(domainKey: string, page: LocalisationAuditCrawledPage): string | null {
  return stripTitleNoise(page.ogTitle) ?? stripTitleNoise(page.title) ?? domainKey;
}

function heuristicProductSummary(page: LocalisationAuditCrawledPage): string | null {
  const description = page.ogDescription ?? page.metaDescription;
  if (description) {
    return description.length > 220 ? `${description.slice(0, 217).trimEnd()}…` : description;
  }
  const heading = page.headings[0]?.trim();
  return heading || null;
}

export function buildHeuristicCompanyProfile(input: {
  domainKey: string;
  page: LocalisationAuditCrawledPage | null;
}): LocalisationAuditCompanyProfile {
  const page = input.page;
  if (!page) {
    return {
      name: input.domainKey,
      logoUrl: null,
      productSummary: null,
      brandVoice: null,
      industry: null,
      confidence: 20,
    };
  }

  return {
    name: heuristicName(input.domainKey, page),
    logoUrl: pickCompanyLogoUrl(page),
    productSummary: heuristicProductSummary(page),
    brandVoice: null,
    industry: null,
    confidence: page.metaDescription || page.ogDescription ? 45 : 30,
  };
}

export function collectCompanyProfileEvidence(input: {
  domainKey: string;
  pages: LocalisationAuditCrawledPage[];
}): CompanyProfileEvidence | null {
  const homepage =
    input.pages.find((page) => {
      try {
        const pathname = new URL(page.url).pathname;
        return pathname === "/" || pathname === "";
      } catch {
        return false;
      }
    }) ?? input.pages[0];

  if (!homepage) {
    return null;
  }

  return {
    domainKey: input.domainKey,
    pageUrl: homepage.url,
    title: homepage.title,
    metaDescription: homepage.metaDescription,
    ogTitle: homepage.ogTitle,
    ogDescription: homepage.ogDescription,
    headings: homepage.headings.slice(0, 8),
    textSample: homepage.textSample.slice(0, 1_200),
    logoUrl: pickCompanyLogoUrl(homepage),
  };
}

export async function inferCompanyProfileWithLuna(
  evidence: CompanyProfileEvidence,
): Promise<LocalisationAuditCompanyProfile> {
  const homepage = emptyCrawledPage({
    url: evidence.pageUrl,
    title: evidence.title,
    textSample: evidence.textSample,
    metaDescription: evidence.metaDescription,
    ogTitle: evidence.ogTitle,
    ogDescription: evidence.ogDescription,
    headings: evidence.headings,
  });
  const heuristic = buildHeuristicCompanyProfile({
    domainKey: evidence.domainKey,
    page: homepage,
  });
  heuristic.logoUrl = evidence.logoUrl;

  if (!env.OPENAI_API_KEY) {
    return heuristic;
  }

  try {
    const { output } = await generateText({
      model: getHyperlocaliseAgentModel(),
      output: Output.object({ schema: companyProfileOutputSchema }),
      prompt: [
        "Infer a concise company profile for a localisation audit report cover.",
        "Only use the provided website evidence. Do not invent products or industries.",
        "name: public brand or product name (not a slogan).",
        "productSummary: one or two sentences on what the company/product does.",
        "brandVoice: short voice descriptor (e.g. 'calm, precise, technical').",
        "industry: short industry label (e.g. 'Developer tools', 'Fintech').",
        "confidence: 0-100 based on evidence strength.",
        "Use null when unknown.",
        JSON.stringify(evidence),
      ].join("\n\n"),
    });

    return {
      name: output.name?.trim() || heuristic.name,
      logoUrl: evidence.logoUrl,
      productSummary: output.productSummary?.trim() || heuristic.productSummary,
      brandVoice: output.brandVoice?.trim() || null,
      industry: output.industry?.trim() || null,
      confidence: Math.max(0, Math.min(100, Math.round(output.confidence))),
    };
  } catch (error) {
    logger.warn("company profile luna inference failed", {
      err: error instanceof Error ? error.message : "unknown",
    });
    return heuristic;
  }
}

export async function buildLocalisationAuditCompanyProfile(input: {
  domainKey: string;
  pages: LocalisationAuditCrawledPage[];
}): Promise<LocalisationAuditCompanyProfile> {
  const evidence = collectCompanyProfileEvidence(input);
  if (!evidence) {
    return buildHeuristicCompanyProfile({ domainKey: input.domainKey, page: null });
  }
  return inferCompanyProfileWithLuna(evidence);
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** True when the cover is missing logo, summary, or other profile fields. */
export function isCompanyProfileIncomplete(
  profile: LocalisationAuditCompanyProfile | null | undefined,
): boolean {
  if (!profile) {
    return true;
  }
  return (
    nonEmpty(profile.name) == null ||
    nonEmpty(profile.logoUrl) == null ||
    nonEmpty(profile.productSummary) == null ||
    nonEmpty(profile.brandVoice) == null ||
    nonEmpty(profile.industry) == null
  );
}

/**
 * Prefer freshly inferred values when present; keep stored values for gaps.
 * A re-run can fill a legacy row without wiping a logo the new crawl missed.
 */
export function mergeCompanyProfiles(
  existing: LocalisationAuditCompanyProfile | null | undefined,
  incoming: LocalisationAuditCompanyProfile,
): LocalisationAuditCompanyProfile {
  if (!existing) {
    return incoming;
  }
  return {
    name: nonEmpty(incoming.name) ?? existing.name,
    logoUrl: nonEmpty(incoming.logoUrl) ?? existing.logoUrl,
    productSummary: nonEmpty(incoming.productSummary) ?? existing.productSummary,
    brandVoice: nonEmpty(incoming.brandVoice) ?? existing.brandVoice,
    industry: nonEmpty(incoming.industry) ?? existing.industry,
    confidence: Math.max(existing.confidence, incoming.confidence),
  };
}

export function companyProfileFromAuditPayloads(input: {
  teaser?: { companyProfile?: LocalisationAuditCompanyProfile | null } | null;
  report?: { companyProfile?: LocalisationAuditCompanyProfile | null } | null;
}): LocalisationAuditCompanyProfile | null {
  return input.report?.companyProfile ?? input.teaser?.companyProfile ?? null;
}
