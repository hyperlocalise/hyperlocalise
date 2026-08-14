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
  clipFindingEvidence,
  creditFinding,
  dominantScript,
  findTofuGlyphs,
  fontStackLooksCjkCapable,
  formatFindingWhere,
  groupPagesByLanguage,
  isCjkLanguage,
  isLatinScriptLanguage,
  isRtlLanguage,
  languageOf,
  looksPrimarilyEnglish,
  pageLocale,
  pathWithoutLocale,
  sourceLanguage,
  textHasCjkScript,
  textHasHangul,
  westernNameFields,
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
      const pairs: Array<{ sourceText: string; targetText: string; tag: string }> = [
        ...zip(sibling.buttons, page.buttons).map(([sourceText, targetText]) => ({
          sourceText,
          targetText,
          tag: "<button>",
        })),
        ...zip(sibling.headings, page.headings).map(([sourceText, targetText]) => ({
          sourceText,
          targetText,
          tag: "heading",
        })),
      ];
      for (const { sourceText, targetText, tag } of pairs) {
        if (sourceText.length < 8 || targetText.length < 8) continue;
        const percent = Math.round((targetText.length / sourceText.length) * 100);
        if (percent >= 160) {
          findings.push(
            creditFinding({
              id: `expansion-${findings.length}`,
              creditId: "text-expansion",
              category: "visual",
              severity: "medium",
              title: "Localized text is much longer than the source",
              summary: `A ${language} string is ${percent}% the length of the source, which often causes overflow.`,
              where: formatFindingWhere({
                section: tag === "<button>" ? "Control" : "Heading",
                tag,
              }),
              url: page.url,
              evidence: clipFindingEvidence(
                `${source.toUpperCase()} "${sourceText}" → ${language.toUpperCase()} "${targetText}" (${percent}%)`,
              ),
              advice:
                "Shorten the translation or give the control more room so the longer copy does not overflow.",
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

  const findings: LocalisationAuditFinding[] = [];
  let score = 100;

  const missingDir = rtlPages.filter((page) => page.dir !== "rtl");
  if (missingDir.length > 0) {
    const sample = missingDir[0]!;
    const lang = sample.htmlLang ?? pageLocale(sample) ?? "ar";
    score -= 45;
    findings.push(
      creditFinding({
        id: "rtl-missing-dir",
        creditId: "rtl-support",
        category: "visual",
        severity: "critical",
        title: "RTL pages do not set dir=rtl",
        summary: "Arabic, Hebrew, or other RTL locales were sampled without a root dir=rtl.",
        where: formatFindingWhere({ section: "Document root", tag: "<html dir>" }),
        url: sample.url,
        evidence: `<html lang="${lang}"> without dir="rtl"`,
        advice: 'Set dir="rtl" on RTL pages.',
        confidence: 98,
      }),
    );
  }

  for (const page of rtlPages) {
    const directions = page.directionValues.map((value) => value.toLowerCase());
    if (directions.some((value) => value.includes("ltr"))) {
      score -= 30;
      findings.push(
        creditFinding({
          id: `rtl-css-direction-ltr-${findings.length}`,
          creditId: "rtl-support",
          category: "visual",
          severity: "high",
          title: "RTL page CSS forces direction: ltr",
          summary: "Sampled CSS sets direction: ltr on an RTL locale page.",
          where: formatFindingWhere({ section: "CSS", tag: "direction" }),
          url: page.url,
          evidence: `direction: ${page.directionValues.join(", ")}`,
          advice: "Use direction: rtl (or rely on html dir=rtl) instead of forcing LTR in CSS.",
          confidence: 95,
        }),
      );
    }

    if (
      page.physicalHorizontalCss.length > 0 &&
      page.logicalHorizontalCss.length === 0 &&
      !directions.some((value) => value.includes("rtl"))
    ) {
      score -= 18;
      findings.push(
        creditFinding({
          id: `rtl-css-physical-${findings.length}`,
          creditId: "rtl-support",
          category: "visual",
          severity: "medium",
          title: "RTL page uses physical left/right CSS",
          summary:
            "Sampled CSS uses float/margin/padding/left/right without logical inline properties, so layout may not mirror in RTL.",
          where: formatFindingWhere({ section: "CSS", tag: "margin/float/text-align" }),
          url: page.url,
          evidence: clipFindingEvidence(page.physicalHorizontalCss.slice(0, 4).join("; ")),
          advice:
            "Prefer logical properties such as margin-inline-start, inset-inline, and text-align: start for RTL layouts.",
          confidence: 84,
        }),
      );
    }
  }

  if (findings.length === 0) {
    return scored(92, []);
  }
  return scored(score, findings);
};

const GENERIC_FONTS = new Set(["arial", "helvetica", "sans-serif", "serif", "system-ui", "tahoma"]);

const scoreFontAndScript: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let inspected = 0;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale || isLatinScriptLanguage(locale)) continue;
    inspected += 1;
    const text = page.textSample;
    const tofu = findTofuGlyphs(text);
    if (tofu.length > 0) {
      findings.push(
        creditFinding({
          id: `font-tofu-${findings.length}`,
          creditId: "font-and-script",
          category: "visual",
          severity: "high",
          title: "Tofu glyphs suggest missing font coverage",
          summary: `A ${locale} page contains replacement or empty-box characters that usually mean glyphs failed to render.`,
          where: formatFindingWhere({ section: "Page body", tag: "sampled copy" }),
          url: page.url,
          evidence: clipFindingEvidence(`Tofu glyphs ${tofu.join(" ")} in: ${text.slice(0, 180)}`),
          advice:
            "Ship a font that covers the page script (for example Noto Sans CJK) so characters do not render as □ or �.",
          confidence: 96,
        }),
      );
    }

    const script = dominantScript(text);
    if (script === "latin" && !textHasCjkScript(text) && !isRtlLanguage(locale)) continue;
    const families = page.fontFamilies.map((family) => family.toLowerCase());
    if (families.length === 0) continue;
    const onlyGeneric = families.every((family) => GENERIC_FONTS.has(family));
    const needsCjkFont = isCjkLanguage(locale) && textHasCjkScript(text);
    if (onlyGeneric || (needsCjkFont && !fontStackLooksCjkCapable(page.fontFamilies))) {
      findings.push(
        creditFinding({
          id: `font-generic-${findings.length}`,
          creditId: "font-and-script",
          category: "visual",
          severity: needsCjkFont ? "high" : "medium",
          title: needsCjkFont
            ? "No CJK-capable font detected"
            : "Typography may not support the target script",
          summary: needsCjkFont
            ? `A ${locale} page shows CJK text but the embedded/inline font stack has no known CJK typeface.`
            : `A ${locale} page only declares generic fallback fonts.`,
          where: formatFindingWhere({ section: "Page body", tag: "font-family" }),
          url: page.url,
          evidence: `font-family: ${page.fontFamilies.join(", ") || "(none declared in sampled CSS)"}`,
          advice: needsCjkFont
            ? "Include a CJK font such as Noto Sans CJK, Malgun Gothic, Hiragino, or PingFang in the stack."
            : "Ship a font that covers the target script instead of a generic fallback stack.",
        }),
      );
    }
  }
  if (inspected === 0) {
    return { status: "na" };
  }
  return scored(findings.length > 0 ? Math.max(35, 90 - findings.length * 14) : 90, findings);
};

const scoreCjkTypography: HeuristicScorer = (context) => {
  const cjkPages = context.pages.filter((page) => {
    const locale = pageLocale(page);
    return locale != null && isCjkLanguage(locale);
  });
  if (cjkPages.length === 0) {
    return { status: "na" };
  }

  const findings: LocalisationAuditFinding[] = [];
  let score = 100;

  for (const page of cjkPages) {
    const locale = pageLocale(page)!;
    const language = languageOf(locale);
    const text = page.textSample;

    if (language === "ko" && textHasHangul(text)) {
      const wordBreaks = page.wordBreakValues.map((value) => value.toLowerCase());
      if (wordBreaks.some((value) => value.includes("break-all"))) {
        score -= 28;
        findings.push(
          creditFinding({
            id: `cjk-wordbreak-breakall-${findings.length}`,
            creditId: "cjk-typography",
            category: "visual",
            severity: "high",
            title: "Korean text uses word-break: break-all",
            summary:
              "break-all can split Hangul mid-word and makes Korean body copy harder to read.",
            where: formatFindingWhere({ section: "CSS", tag: "word-break" }),
            url: page.url,
            evidence: `word-break: ${page.wordBreakValues.join(", ")}`,
            advice: "Use word-break: keep-all for Korean text instead of break-all.",
            confidence: 94,
          }),
        );
      } else if (wordBreaks.length > 0 && !wordBreaks.some((value) => value.includes("keep-all"))) {
        score -= 14;
        findings.push(
          creditFinding({
            id: `cjk-wordbreak-missing-keepall-${findings.length}`,
            creditId: "cjk-typography",
            category: "visual",
            severity: "medium",
            title: "Korean page omits word-break: keep-all",
            summary: "Sampled CSS sets word-break but not keep-all, so Hangul may wrap awkwardly.",
            where: formatFindingWhere({ section: "CSS", tag: "word-break" }),
            url: page.url,
            evidence: `word-break: ${page.wordBreakValues.join(", ")}`,
            advice: "Set word-break: keep-all on Korean body copy and UI text.",
            confidence: 82,
          }),
        );
      } else if (wordBreaks.length === 0 && page.fontFamilies.length > 0) {
        // Only warn when we clearly sampled embedded CSS but saw no keep-all rule.
        score -= 8;
        findings.push(
          creditFinding({
            id: `cjk-wordbreak-unspecified-${findings.length}`,
            creditId: "cjk-typography",
            category: "visual",
            severity: "low",
            title: "No Korean word-break rule found in sampled CSS",
            summary:
              "Embedded CSS was found, but it does not declare word-break: keep-all for Hangul.",
            where: formatFindingWhere({ section: "CSS", tag: "word-break" }),
            url: page.url,
            evidence: "Sampled <style>/inline CSS declares fonts but no word-break: keep-all",
            advice: "Add word-break: keep-all for Korean text containers.",
            confidence: 72,
          }),
        );
      }
    }

    const westernNames = westernNameFields(page.formFieldLabels);
    if (westernNames.length > 0) {
      score -= 16;
      findings.push(
        creditFinding({
          id: `cjk-naming-${findings.length}`,
          creditId: "cjk-typography",
          category: "visual",
          severity: "medium",
          title: "Western name fields on a CJK page",
          summary: `A ${locale} form still uses Western first/last name labels instead of local naming conventions.`,
          where: formatFindingWhere({ section: "Form", tag: "<label> or <input>" }),
          url: page.url,
          evidence: clipFindingEvidence(westernNames.slice(0, 4).join(" / ")),
          advice:
            language === "ko"
              ? "Prefer 성 / 이름 (or a single 이름 field) instead of First name / Last name."
              : language === "ja"
                ? "Prefer 姓 / 名 instead of First name / Last name."
                : "Prefer 姓 / 名 (or the local name-order labels) instead of First name / Last name.",
          confidence: 88,
        }),
      );
    }
  }

  if (findings.length === 0) {
    return scored(92, []);
  }
  return scored(score, findings);
};

const scoreLocalizedImages: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  let latinAmbiguous = false;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale || languageOf(locale) === "en") continue;
    for (const image of page.altTexts) {
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
              where: formatFindingWhere({ section: "Page body", tag: "<img alt>" }),
              url: page.url,
              evidence: clipFindingEvidence(`alt="${image.alt}" src="${image.src}"`),
              advice: "Localize the image asset and alt text for this page locale.",
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
            where: formatFindingWhere({ section: "Page body", tag: "heading" }),
            url: page.url,
            evidence: clipFindingEvidence(heading),
            advice: "Shorten the heading so it does not crowd the visual hierarchy.",
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
          where: formatFindingWhere({ section: "Page body", tag: "<button>" }),
          url: pages[0]?.url,
          evidence: `Source locale has ${sourceCount} buttons; ${language} has ${count}.`,
          advice: "Keep the same repeated controls across locales, or drop unused ones on purpose.",
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
  "cjk-typography": scoreCjkTypography,
  "localized-images": scoreLocalizedImages,
  "visual-hierarchy": scoreVisualHierarchy,
  "component-consistency": scoreComponentConsistency,
  "text-overflow": lunaProxy,
  "layout-breakage": lunaProxy,
  "responsive-localisation": lunaProxy,
};
