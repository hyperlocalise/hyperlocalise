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
import type { LocalisationAuditCreditDefinition } from "./types";

export const LOCALISATION_AUDIT_CREDITS: LocalisationAuditCreditDefinition[] = [
  {
    id: "locale-detection",
    dimension: "technical",
    title: "Locale detection",
    mode: "heuristic",
    rubric: "Pages should declare a correct html lang that matches the URL and content locale.",
  },
  {
    id: "locale-routing",
    dimension: "technical",
    title: "Locale routing",
    mode: "heuristic",
    rubric: "Localized pages should use a consistent URL structure and resolve successfully.",
  },
  {
    id: "language-switcher",
    dimension: "technical",
    title: "Language switcher",
    mode: "hybrid",
    rubric: "Visitors should move between locales without losing the current page.",
  },
  {
    id: "hreflang",
    dimension: "technical",
    title: "hreflang",
    mode: "heuristic",
    rubric:
      "Localized versions should be linked with valid, reciprocal hreflang including self and x-default.",
  },
  {
    id: "canonical-urls",
    dimension: "technical",
    title: "Canonical URLs",
    mode: "heuristic",
    rubric: "Canonical URLs should represent the localized page, not a different locale.",
  },
  {
    id: "localized-seo-metadata",
    dimension: "technical",
    title: "Localized SEO metadata",
    mode: "heuristic",
    rubric: "Titles, descriptions, and og:locale should be localized per locale.",
  },
  {
    id: "sitemap",
    dimension: "technical",
    title: "Sitemap",
    mode: "heuristic",
    rubric:
      "Like Lighthouse: a valid XML sitemap must be discoverable, robots.txt should reference it with an absolute Sitemap: URL, and localized URLs should appear for published locales.",
  },
  {
    id: "structured-data",
    dimension: "technical",
    title: "Structured data",
    mode: "heuristic",
    rubric: "JSON-LD inLanguage should match the page locale when structured data is present.",
  },
  {
    id: "international-formatting",
    dimension: "technical",
    title: "International formatting",
    mode: "hybrid",
    rubric: "Dates, numbers, and currency should match locale conventions.",
  },
  {
    id: "accessibility-localisation",
    dimension: "technical",
    title: "Accessibility localisation",
    mode: "hybrid",
    rubric: "lang, aria-label, and alt text should match the page locale.",
  },
  {
    id: "translation-completeness",
    dimension: "linguistic",
    title: "Translation completeness",
    mode: "hybrid",
    rubric:
      "Localized pages should not leave source-language copy in place, except brand names and URLs.",
  },
  {
    id: "terminology-consistency",
    dimension: "linguistic",
    title: "Terminology consistency",
    mode: "hybrid",
    rubric: "Important concepts should not be translated differently across pages.",
  },
  {
    id: "cross-page-consistency",
    dimension: "linguistic",
    title: "Cross-page consistency",
    mode: "na",
    rubric:
      "Related navigation and messaging should stay consistent across the locale. Skipped in the public audit because label variance is usually noise.",
  },
  {
    id: "translation-accuracy",
    dimension: "linguistic",
    title: "Translation accuracy",
    mode: "luna",
    rubric: "Target copy should preserve the source meaning, numbers, and product actions.",
  },
  {
    id: "fluency",
    dimension: "linguistic",
    title: "Fluency",
    mode: "luna",
    rubric: "Copy should sound natural, without grammar issues or machine-translation artifacts.",
  },
  {
    id: "brand-voice",
    dimension: "linguistic",
    title: "Brand voice",
    mode: "luna",
    rubric: "Localized copy should preserve the intended tone of the source.",
  },
  {
    id: "grammar-and-style",
    dimension: "linguistic",
    title: "Grammar and style",
    mode: "luna",
    rubric:
      "Locale-specific capitalization, punctuation, formality, and agreement should be correct.",
  },
  {
    id: "cta-intent",
    dimension: "contextual",
    title: "CTA intent",
    mode: "hybrid",
    rubric: "Localized calls to action should communicate the intended product action.",
  },
  {
    id: "cultural-adaptation",
    dimension: "contextual",
    title: "Cultural adaptation",
    mode: "hybrid",
    rubric: "Currency, dates, addresses, and local examples should fit the market.",
  },
  {
    id: "ui-context",
    dimension: "contextual",
    title: "UI context",
    mode: "luna",
    rubric: "Translations should fit the UI component: button, nav, form, modal, or error.",
  },
  {
    id: "product-context",
    dimension: "contextual",
    title: "Product context",
    mode: "luna",
    rubric: "Language should match product concepts such as plans, settings, and workflows.",
  },
  {
    id: "contextual-meaning",
    dimension: "contextual",
    title: "Contextual meaning",
    mode: "luna",
    rubric: "Strings should be judged in surrounding page and component context, not in isolation.",
  },
  {
    id: "audience-context",
    dimension: "contextual",
    title: "Audience context",
    mode: "luna",
    rubric:
      "Language should fit the intended audience, such as consumer, enterprise, or developer.",
  },
  {
    id: "glossary-compliance",
    dimension: "contextual",
    title: "Glossary compliance",
    mode: "na",
    rubric: "Requires a project glossary, which this public audit does not have.",
  },
  {
    id: "translation-memory",
    dimension: "contextual",
    title: "Translation memory consistency",
    mode: "na",
    rubric: "Requires approved translation memory, which this public audit does not have.",
  },
  {
    id: "text-expansion",
    dimension: "visual",
    title: "Text expansion",
    mode: "heuristic",
    rubric: "Longer translations should not create obvious length pressure versus the source UI.",
  },
  {
    id: "rtl-support",
    dimension: "visual",
    title: "RTL support",
    mode: "hybrid",
    rubric: "RTL locales should set dir and mirror layout, navigation, and forms.",
  },
  {
    id: "font-and-script",
    dimension: "visual",
    title: "Font and script support",
    mode: "heuristic",
    rubric:
      "Typography should support the target script without generic fallback-only stacks, tofu glyphs, or missing CJK fonts.",
  },
  {
    id: "cjk-typography",
    dimension: "visual",
    title: "CJK typography",
    mode: "heuristic",
    rubric:
      "Korean pages should avoid word-break: break-all and prefer word-break: keep-all; CJK forms should use local name-field conventions.",
  },
  {
    id: "localized-images",
    dimension: "visual",
    title: "Localized images and assets",
    mode: "hybrid",
    rubric: "Language-specific images and alt text should match the page locale.",
  },
  {
    id: "visual-hierarchy",
    dimension: "visual",
    title: "Visual hierarchy",
    mode: "hybrid",
    rubric: "Localization should not make headings or CTAs lose scanability.",
  },
  {
    id: "component-consistency",
    dimension: "visual",
    title: "Component consistency",
    mode: "hybrid",
    rubric: "Repeated components should stay visually consistent across locales.",
  },
  {
    id: "text-overflow",
    dimension: "visual",
    title: "Text overflow",
    mode: "luna",
    rubric: "Text should not clip, truncate unexpectedly, or overflow buttons and navigation.",
  },
  {
    id: "layout-breakage",
    dimension: "visual",
    title: "Layout breakage",
    mode: "luna",
    rubric: "Localized pages should not overlap, break grids, or overflow modals.",
  },
  {
    id: "responsive-localisation",
    dimension: "visual",
    title: "Responsive localisation",
    mode: "luna",
    rubric: "Localized layouts should hold up across mobile, tablet, and desktop widths.",
  },
];

export function creditById(id: string): LocalisationAuditCreditDefinition | undefined {
  return LOCALISATION_AUDIT_CREDITS.find((credit) => credit.id === id);
}
