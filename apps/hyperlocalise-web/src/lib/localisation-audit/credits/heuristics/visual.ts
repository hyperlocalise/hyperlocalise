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
import type { LocalisationAuditFinding } from "../../types";
import {
  clampScore,
  creditFinding,
  dominantScript,
  groupPagesByLanguage,
  isCjkLanguage,
  isLatinScriptLanguage,
  isRtlLanguage,
  languageOf,
  looksPrimarilyEnglish,
  pageLocale,
  pathWithoutLocale,
  sourceLanguage,
} from "../shared";
import type { HeuristicCreditOutcome, HeuristicScorer } from "../types";

function scored(score: number, findings: LocalisationAuditFinding[]): HeuristicCreditOutcome {
  return { status: "scored", score: clampScore(score), findings };
}

const scoreTextExpansion: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const grouped = groupPagesByLanguage(context.pages);
  const sourcePages = grouped.get(source) ?? [];
  if (sourcePages.length === 0 || grouped.size < 2) {
    return { status: "na" };
  }
  const findings: LocalisationAuditFinding[] = [];
  const sourceByPath = new Map(
    sourcePages.map((page) => [pathWithoutLocale(page.url) ?? page.url, page]),
  );
  for (const [language, pages] of grouped) {
    if (language === source) continue;
    for (const page of pages) {
      const sibling = sourceByPath.get(pathWithoutLocale(page.url) ?? "");
      if (!sibling) continue;
      const pairs = [
        ...zip(sibling.buttons, page.buttons),
        ...zip(sibling.headings, page.headings),
      ];
      for (const [sourceText, targetText] of pairs) {
        if (sourceText.length < 8 || targetText.length < 8) continue;
        if (targetText.length / sourceText.length >= 1.6) {
          findings.push(
            creditFinding({
              id: `expansion-${findings.length}`,
              creditId: "text-expansion",
              category: "visual",
              severity: "medium",
              title: "Localized text is much longer than the source",
              summary: `A ${language} string is ${Math.round((targetText.length / sourceText.length) * 100)}% the length of the source, which often causes overflow.`,
              url: page.url,
              evidence: `${sourceText} → ${targetText}`,
              confidence: 88,
            }),
          );
        }
      }
    }
  }
  if (findings.length === 0) {
    return scored(90, []);
  }
  return scored(Math.max(40, 78 - findings.length * 8), findings);
};

function zip(a: string[], b: string[]): Array<[string, string]> {
  const length = Math.min(a.length, b.length);
  const pairs: Array<[string, string]> = [];
  for (let index = 0; index < length; index += 1) {
    pairs.push([a[index]!, b[index]!]);
  }
  return pairs;
}

const scoreRtlSupport: HeuristicScorer = (context) => {
  const rtlPages = context.pages.filter((page) => {
    const locale = pageLocale(page);
    return locale != null && isRtlLanguage(locale);
  });
  if (rtlPages.length === 0) {
    return { status: "na" };
  }
  const missingDir = rtlPages.filter((page) => page.dir !== "rtl");
  if (missingDir.length > 0) {
    return scored(28, [
      creditFinding({
        id: "rtl-missing-dir",
        creditId: "rtl-support",
        category: "visual",
        severity: "critical",
        title: "RTL pages do not set dir=rtl",
        summary: "Arabic, Hebrew, or other RTL locales were sampled without a root dir=rtl.",
        url: missingDir[0]?.url,
        confidence: 98,
      }),
    ]);
  }
  return {
    status: "inconclusive",
    evidence: {
      reason: "dir_present_layout_mirroring_unknown",
      urls: rtlPages.map((page) => page.url),
    },
  };
};

const GENERIC_FONTS = new Set(["arial", "helvetica", "sans-serif", "serif", "system-ui", "tahoma"]);

const scoreFontAndScript: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let inspected = 0;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale || isLatinScriptLanguage(locale)) continue;
    inspected += 1;
    const script = dominantScript(page.textSample);
    if (script === "latin") continue;
    const families = page.fontFamilies.map((family) => family.toLowerCase());
    if (families.length === 0) continue;
    const onlyGeneric = families.every((family) => GENERIC_FONTS.has(family));
    if (onlyGeneric) {
      findings.push(
        creditFinding({
          id: `font-generic-${findings.length}`,
          creditId: "font-and-script",
          category: "visual",
          severity: "medium",
          title: "Typography may not support the target script",
          summary: `A ${locale} page only declares generic fallback fonts.`,
          url: page.url,
          evidence: page.fontFamilies.join(", "),
        }),
      );
    }
  }
  if (inspected === 0) {
    return { status: "na" };
  }
  return scored(findings.length > 0 ? 62 : 90, findings);
};

const scoreLocalizedImages: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let latinAmbiguous = false;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale || languageOf(locale) === "en") continue;
    for (const image of page.altTexts) {
      const haystack = `${image.alt} ${image.src}`;
      if (isCjkLanguage(locale) || isRtlLanguage(locale)) {
        if (looksPrimarilyEnglish(image.alt) || /[-_/](en|english)[-_./]/i.test(image.src)) {
          findings.push(
            creditFinding({
              id: `image-unlocalized-${findings.length}`,
              creditId: "localized-images",
              category: "visual",
              severity: "medium",
              title: "Image still looks like the source locale",
              summary: `Alt text or filename on a ${locale} page appears to be English.`,
              url: page.url,
              evidence: haystack.slice(0, 160),
            }),
          );
        }
      } else {
        latinAmbiguous = true;
      }
    }
  }
  if (latinAmbiguous && findings.length === 0) {
    return { status: "inconclusive", evidence: { reason: "latin_image_alts" } };
  }
  if (context.pages.every((page) => page.altTexts.length === 0)) {
    return { status: "na" };
  }
  return scored(findings.length > 0 ? 58 : 88, findings);
};

const scoreVisualHierarchy: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  for (const page of context.pages) {
    for (const heading of page.headings) {
      if (heading.length >= 80) {
        findings.push(
          creditFinding({
            id: `hierarchy-heading-${findings.length}`,
            creditId: "visual-hierarchy",
            category: "visual",
            severity: "low",
            title: "Heading is excessively long",
            summary: "A localized heading may crowd the visual hierarchy.",
            url: page.url,
            evidence: heading.slice(0, 160),
            confidence: 80,
          }),
        );
      }
    }
  }
  if (findings.length > 0) {
    return scored(Math.max(55, 82 - findings.length * 6), findings);
  }
  return { status: "inconclusive", evidence: { reason: "no_long_headings" } };
};

const scoreComponentConsistency: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const grouped = groupPagesByLanguage(context.pages);
  if (grouped.size < 2) {
    return { status: "na" };
  }
  const sourceCount = (grouped.get(source) ?? [])[0]?.buttons.length ?? 0;
  for (const [language, pages] of grouped) {
    if (language === source) continue;
    const count = pages[0]?.buttons.length ?? 0;
    if (sourceCount >= 2 && count >= 2 && Math.abs(count - sourceCount) >= 2) {
      return scored(70, [
        creditFinding({
          id: "component-count-drift",
          creditId: "component-consistency",
          category: "visual",
          severity: "low",
          title: "Repeated components differ across locales",
          summary: `Button counts differ between the source locale and ${language}.`,
        }),
      ]);
    }
  }
  return { status: "inconclusive", evidence: { reason: "no_component_drift" } };
};

const lunaProxy: HeuristicScorer = () => ({
  status: "inconclusive",
  evidence: { reason: "no_rendered_layout" },
});

export const visualHeuristicScorers: Record<string, HeuristicScorer> = {
  "text-expansion": scoreTextExpansion,
  "rtl-support": scoreRtlSupport,
  "font-and-script": scoreFontAndScript,
  "localized-images": scoreLocalizedImages,
  "visual-hierarchy": scoreVisualHierarchy,
  "component-consistency": scoreComponentConsistency,
  "text-overflow": lunaProxy,
  "layout-breakage": lunaProxy,
  "responsive-localisation": lunaProxy,
};
