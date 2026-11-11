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
import type {
  LocalisationAuditCrawledPage,
  LocalisationAuditFinding,
  LocalisationAuditLayoutElement,
  LocalisationAuditLayoutViewport,
} from "../../types";
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
  passingShareScore,
  pathWithoutLocale,
  sourceLanguage,
  textHasCjkScript,
  textHasHangul,
  westernNameFields,
} from "../shared";
import type { AuditCreditContext, HeuristicCreditOutcome, HeuristicScorer } from "../types";

/** Target copy at or above this share of the source length is flagged. */
const TEXT_EXPANSION_FLAG_PERCENT = 160;
const LONG_HEADING_CHARS = 80;
/** Ignore sub-pixel rounding when measuring horizontal overflow. */
const HORIZONTAL_OVERFLOW_TOLERANCE_PX = 2;
/** Widths at or below this are treated as the mobile viewport. */
const MOBILE_VIEWPORT_MAX_WIDTH = 480;

function scored(score: number, findings: LocalisationAuditFinding[]): HeuristicCreditOutcome {
  return { status: "scored", score: clampScore(score), findings };
}

function targetPages(context: AuditCreditContext): LocalisationAuditCrawledPage[] {
  const source = sourceLanguage(context.detectedLocales);
  return context.pages.filter((page) => {
    const locale = pageLocale(page);
    return locale != null && languageOf(locale) !== source;
  });
}

function sourceSiblingByPath(
  context: AuditCreditContext,
): Map<string, LocalisationAuditCrawledPage> {
  const source = sourceLanguage(context.detectedLocales);
  const sourcePages = groupPagesByLanguage(context.pages).get(source) ?? [];
  return new Map(sourcePages.map((page) => [pathWithoutLocale(page.url) ?? page.url, page]));
}

const scoreTextExpansion: HeuristicScorer = (context) => {
  const source = sourceLanguage(context.detectedLocales);
  const grouped = groupPagesByLanguage(context.pages);
  if ((grouped.get(source) ?? []).length === 0 || grouped.size < 2) {
    return { status: "na" };
  }
  const findings: LocalisationAuditFinding[] = [];
  const sourceByPath = sourceSiblingByPath(context);
  let inspected = 0;
  const failingPages = new Set<string>();
  for (const page of targetPages(context)) {
    const language = languageOf(pageLocale(page)!);
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
    ].filter((pair) => pair.sourceText.length >= 8 && pair.targetText.length >= 8);
    if (pairs.length === 0) continue;
    inspected += 1;
    for (const { sourceText, targetText, tag } of pairs) {
      const percent = Math.round((targetText.length / sourceText.length) * 100);
      if (percent < TEXT_EXPANSION_FLAG_PERCENT) continue;
      failingPages.add(page.url);
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
  if (inspected === 0) {
    return { status: "na" };
  }
  return scored(passingShareScore(inspected, failingPages.size), findings);
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
  const failingPages = new Set<string>();

  const missingDir = rtlPages.filter((page) => page.dir !== "rtl");
  for (const page of missingDir) failingPages.add(page.url);
  if (missingDir.length > 0) {
    const sample = missingDir[0]!;
    const lang = sample.htmlLang ?? pageLocale(sample) ?? "ar";
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
      failingPages.add(page.url);
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

    // Physical CSS is a risk signal, not proof of a broken mirror, so it does not fail the page.
    if (
      page.physicalHorizontalCss.length > 0 &&
      page.logicalHorizontalCss.length === 0 &&
      !directions.some((value) => value.includes("rtl"))
    ) {
      findings.push(
        creditFinding({
          id: `rtl-css-physical-${findings.length}`,
          creditId: "rtl-support",
          category: "visual",
          severity: "low",
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

  return scored(passingShareScore(rtlPages.length, failingPages.size), findings);
};

const GENERIC_FONTS = new Set(["arial", "helvetica", "sans-serif", "serif", "system-ui", "tahoma"]);

const scoreFontAndScript: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  const failingPages = new Set<string>();
  let inspected = 0;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale || isLatinScriptLanguage(locale)) continue;
    inspected += 1;
    const text = page.textSample;
    const tofu = findTofuGlyphs(text);
    if (tofu.length > 0) {
      failingPages.add(page.url);
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
      failingPages.add(page.url);
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
  return scored(passingShareScore(inspected, failingPages.size), findings);
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
  const failingPages = new Set<string>();

  for (const page of cjkPages) {
    const locale = pageLocale(page)!;
    const language = languageOf(locale);
    const text = page.textSample;

    if (language === "ko" && textHasHangul(text)) {
      const wordBreaks = page.wordBreakValues.map((value) => value.toLowerCase());
      if (wordBreaks.some((value) => value.includes("break-all"))) {
        failingPages.add(page.url);
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
        failingPages.add(page.url);
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
        // Absence in sampled CSS is weak evidence (rules may live in external sheets).
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
      failingPages.add(page.url);
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

  return scored(passingShareScore(cjkPages.length, failingPages.size), findings);
};

const scoreLocalizedImages: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  const failingPages = new Set<string>();
  let inspected = 0;
  let latinAmbiguous = false;
  for (const page of context.pages) {
    const locale = pageLocale(page);
    if (!locale || languageOf(locale) === "en" || page.altTexts.length === 0) continue;
    // English alt text cannot be told apart from Latin-script target copy by script alone.
    if (!isCjkLanguage(locale) && !isRtlLanguage(locale)) {
      latinAmbiguous = true;
      continue;
    }
    inspected += 1;
    const image = page.altTexts.find(
      (item) => looksPrimarilyEnglish(item.alt) || /[-_/](en|english)[-_./]/i.test(item.src),
    );
    if (!image) continue;
    failingPages.add(page.url);
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
  if (inspected === 0) {
    return latinAmbiguous
      ? { status: "inconclusive", evidence: { reason: "latin_image_alts" } }
      : { status: "na" };
  }
  return scored(passingShareScore(inspected, failingPages.size), findings);
};

const scoreVisualHierarchy: HeuristicScorer = (context) => {
  const findings: LocalisationAuditFinding[] = [];
  const failingPages = new Set<string>();
  let inspected = 0;
  for (const page of targetPages(context)) {
    if (page.headings.length === 0) continue;
    inspected += 1;
    const heading = page.headings.find((item) => item.length >= LONG_HEADING_CHARS);
    if (!heading) continue;
    failingPages.add(page.url);
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
  if (inspected === 0) {
    return { status: "na" };
  }
  return scored(passingShareScore(inspected, failingPages.size), findings);
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
  return { status: "na" };
};

type ViewportPick = "desktop" | "mobile";

function pickViewport(
  page: LocalisationAuditCrawledPage,
  pick: ViewportPick,
): LocalisationAuditLayoutViewport | null {
  const viewports = page.layout?.viewports ?? [];
  if (viewports.length === 0) return null;
  const sorted = viewports.toSorted((a, b) => a.width - b.width);
  if (pick === "mobile") {
    const mobile = sorted[0]!;
    return mobile.width <= MOBILE_VIEWPORT_MAX_WIDTH ? mobile : null;
  }
  return sorted.at(-1) ?? null;
}

type LayoutProblem = {
  count: number;
  sample: LocalisationAuditLayoutElement | null;
  overflowPx: number;
};

function clippedProblem(viewport: LocalisationAuditLayoutViewport): LayoutProblem {
  return {
    count: viewport.clippedText.length,
    sample: viewport.clippedText[0] ?? null,
    overflowPx: 0,
  };
}

function breakageProblem(viewport: LocalisationAuditLayoutViewport): LayoutProblem {
  const overflowPx =
    viewport.horizontalOverflowPx > HORIZONTAL_OVERFLOW_TOLERANCE_PX
      ? viewport.horizontalOverflowPx
      : 0;
  return {
    count: viewport.offscreen.length + (overflowPx > 0 ? 1 : 0),
    sample: viewport.offscreen[0] ?? null,
    overflowPx,
  };
}

/**
 * Score a rendered-layout problem on localized pages. A problem only counts
 * against localisation when both the localized page and its source-language
 * sibling have the requested viewport and the source page is cleaner. Pages
 * without a comparable source measurement are skipped.
 */
function scoreRenderedLayout(
  context: AuditCreditContext,
  input: {
    creditId: string;
    viewport: ViewportPick;
    measure: (viewport: LocalisationAuditLayoutViewport) => LayoutProblem;
    finding: (
      page: LocalisationAuditCrawledPage,
      problem: LayoutProblem,
      width: number,
    ) => {
      title: string;
      summary: string;
      where: string;
      evidence: string;
      advice: string;
      severity: LocalisationAuditFinding["severity"];
    };
  },
): HeuristicCreditOutcome {
  const sourceByPath = sourceSiblingByPath(context);
  const findings: LocalisationAuditFinding[] = [];
  const failingPages = new Set<string>();
  let inspected = 0;
  for (const page of targetPages(context)) {
    if (page.status < 200 || page.status >= 400) continue;
    const viewport = pickViewport(page, input.viewport);
    if (!viewport) continue;
    const sibling = sourceByPath.get(pathWithoutLocale(page.url) ?? "");
    const siblingViewport = sibling ? pickViewport(sibling, input.viewport) : null;
    if (!siblingViewport) continue;
    inspected += 1;
    const problem = input.measure(viewport);
    if (problem.count === 0) continue;
    if (input.measure(siblingViewport).count >= problem.count) continue;
    failingPages.add(page.url);
    const detail = input.finding(page, problem, viewport.width);
    findings.push(
      creditFinding({
        id: `${input.creditId}-${findings.length}`,
        creditId: input.creditId,
        category: "visual",
        severity: detail.severity,
        title: detail.title,
        summary: detail.summary,
        where: detail.where,
        url: page.url,
        evidence: clipFindingEvidence(detail.evidence),
        advice: detail.advice,
        confidence: 95,
      }),
    );
  }
  if (inspected === 0) {
    return { status: "na" };
  }
  return scored(passingShareScore(inspected, failingPages.size), findings);
}

function describeElement(element: LocalisationAuditLayoutElement | null): string {
  return element ? `<${element.tag}> "${element.text}"` : "page content";
}

const scoreTextOverflow: HeuristicScorer = (context) =>
  scoreRenderedLayout(context, {
    creditId: "text-overflow",
    viewport: "desktop",
    measure: clippedProblem,
    finding: (page, problem, width) => ({
      severity: "high",
      title: "Localized text is clipped",
      summary: `${problem.count} control or heading label${problem.count === 1 ? " is" : "s are"} cut off on this ${pageLocale(page)} page at ${width}px, more than on the source page.`,
      where: formatFindingWhere({
        section: "Rendered layout",
        tag: problem.sample ? `<${problem.sample.tag}>` : "text",
      }),
      evidence: `Clipped at ${width}px: ${describeElement(problem.sample)}`,
      advice:
        "Let the control grow with its label (avoid fixed widths and overflow: hidden), or shorten the translation.",
    }),
  });

const scoreLayoutBreakage: HeuristicScorer = (context) =>
  scoreRenderedLayout(context, {
    creditId: "layout-breakage",
    viewport: "desktop",
    measure: breakageProblem,
    finding: (page, problem, width) => ({
      severity: "high",
      title: "Localized layout overflows the viewport",
      summary: `This ${pageLocale(page)} page pushes content past the ${width}px desktop viewport, which the source page does not.`,
      where: formatFindingWhere({ section: "Rendered layout", tag: "document" }),
      evidence:
        problem.overflowPx > 0
          ? `Horizontal overflow of ${problem.overflowPx}px at ${width}px; e.g. ${describeElement(problem.sample)}`
          : `Off-screen at ${width}px: ${describeElement(problem.sample)}`,
      advice:
        "Allow navigation and grids to wrap, and remove fixed widths that cannot fit longer translations.",
    }),
  });

const scoreResponsiveLocalisation: HeuristicScorer = (context) =>
  scoreRenderedLayout(context, {
    creditId: "responsive-localisation",
    viewport: "mobile",
    measure: (viewport) => {
      const breakage = breakageProblem(viewport);
      const clipped = clippedProblem(viewport);
      return {
        count: breakage.count + clipped.count,
        sample: breakage.sample ?? clipped.sample,
        overflowPx: breakage.overflowPx,
      };
    },
    finding: (page, problem, width) => ({
      severity: "high",
      title: "Localized page breaks on mobile",
      summary: `At ${width}px this ${pageLocale(page)} page scrolls sideways or clips labels, more than the source page.`,
      where: formatFindingWhere({ section: "Rendered layout · mobile", tag: "document" }),
      evidence:
        problem.overflowPx > 0
          ? `Horizontal overflow of ${problem.overflowPx}px at ${width}px; e.g. ${describeElement(problem.sample)}`
          : `At ${width}px: ${describeElement(problem.sample)}`,
      advice:
        "Test translated copy at mobile widths and let long labels wrap instead of forcing a single line.",
    }),
  });

export const visualHeuristicScorers: Record<string, HeuristicScorer> = {
  "text-expansion": scoreTextExpansion,
  "rtl-support": scoreRtlSupport,
  "font-and-script": scoreFontAndScript,
  "cjk-typography": scoreCjkTypography,
  "localized-images": scoreLocalizedImages,
  "visual-hierarchy": scoreVisualHierarchy,
  "component-consistency": scoreComponentConsistency,
  "text-overflow": scoreTextOverflow,
  "layout-breakage": scoreLayoutBreakage,
  "responsive-localisation": scoreResponsiveLocalisation,
};
