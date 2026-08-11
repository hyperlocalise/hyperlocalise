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
import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";
import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import type { CatSegmentIntelligence } from "@/components/cat/shared/types";

import type {
  CatVisualEditorFilePage,
  CatVisualEditorFixture,
  CatVisualEditorPreviewKind,
  CatVisualEditorProgress,
  CatVisualEditorSegment,
} from "./cat-visual-editor.types";

export type {
  CatVisualEditorDevice,
  CatVisualEditorFilePage,
  CatVisualEditorFixture,
  CatVisualEditorNodeMeta,
  CatVisualEditorPreviewKind,
  CatVisualEditorProgress,
  CatVisualEditorSegment,
} from "./cat-visual-editor.types";

const SOURCE_LOCALE = "en-US";
const TARGET_LOCALE = "de-DE";

export const visualEditorFilesFixture: ProjectFileRecord[] = [
  createProjectFileRecord({
    sourcePath: "pages/home.json",
    filename: "home.json",
    storedFileId: "file_home",
    sourceHash: "sha256:home",
    latestJob: {
      id: "job_home",
      status: "succeeded",
      createdAt: new Date().toISOString(),
      type: "file",
    },
  }),
  createProjectFileRecord({
    sourcePath: "pages/pricing.json",
    filename: "pricing.json",
    storedFileId: "file_pricing",
    sourceHash: "sha256:pricing",
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "pages/features.json",
    filename: "features.json",
    storedFileId: "file_features",
    sourceHash: "sha256:features",
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "pages/about.json",
    filename: "about.json",
    storedFileId: "file_about",
    sourceHash: "sha256:about",
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "pages/dashboard/overview.json",
    filename: "overview.json",
    storedFileId: "file_dashboard_overview",
    sourceHash: "sha256:dashboard-overview",
    latestJob: null,
  }),
  createProjectFileRecord({
    sourcePath: "pages/help/getting-started.json",
    filename: "getting-started.json",
    storedFileId: "file_help_getting_started",
    sourceHash: "sha256:help-getting-started",
    latestJob: null,
  }),
];

function createSegment(
  input: Omit<CatVisualEditorSegment, "sourceLocale" | "targetLocale" | "index"> & {
    index: number;
  },
): CatVisualEditorSegment {
  return {
    sourceLocale: SOURCE_LOCALE,
    targetLocale: TARGET_LOCALE,
    ...input,
  };
}

function buildIntelligenceForSegments(
  segments: CatVisualEditorSegment[],
  primary: { segmentId: string; intelligence: CatSegmentIntelligence },
): Record<string, CatSegmentIntelligence> {
  return {
    [primary.segmentId]: primary.intelligence,
    ...Object.fromEntries(
      segments
        .filter((segment) => segment.id !== primary.segmentId)
        .map((segment) => [
          segment.id,
          {
            ...primary.intelligence,
            intent: segment.contextLabel ?? segment.key,
            productMeaning: segment.contextLabel
              ? `${segment.contextLabel} in ${segment.sourcePath ?? "this file"}.`
              : primary.intelligence.productMeaning,
            filePath: segment.sourcePath,
            aiSuggestion: segment.targetText || segment.sourceText,
            glossaryTerms: primary.intelligence.glossaryTerms,
            translationMemoryMatches: [],
          } satisfies CatSegmentIntelligence,
        ]),
    ),
  };
}

export const visualEditorHomeSegmentsFixture: CatVisualEditorSegment[] = [
  createSegment({
    id: "ve-seg-nav-product",
    index: 1,
    key: "nav.product",
    sourceText: "Product",
    targetText: "Produkt",
    contextLabel: "Primary navigation",
    status: "reviewed",
    sourcePath: "pages/home.json",
    tags: ["nav"],
    node: { tagName: "A", selector: "nav a[data-node='nav-product']" },
  }),
  createSegment({
    id: "ve-seg-nav-solutions",
    index: 2,
    key: "nav.solutions",
    sourceText: "Solutions",
    targetText: "Lösungen",
    contextLabel: "Primary navigation",
    status: "reviewed",
    sourcePath: "pages/home.json",
    tags: ["nav"],
    node: { tagName: "A", selector: "nav a[data-node='nav-solutions']" },
  }),
  createSegment({
    id: "ve-seg-nav-resources",
    index: 3,
    key: "nav.resources",
    sourceText: "Resources",
    targetText: "Ressourcen",
    contextLabel: "Primary navigation",
    status: "reviewed",
    sourcePath: "pages/home.json",
    tags: ["nav"],
    node: { tagName: "A", selector: "nav a[data-node='nav-resources']" },
  }),
  createSegment({
    id: "ve-seg-nav-pricing",
    index: 4,
    key: "nav.pricing",
    sourceText: "Pricing",
    targetText: "Preise",
    contextLabel: "Primary navigation",
    status: "needs_review",
    sourcePath: "pages/home.json",
    tags: ["nav"],
    node: { tagName: "A", selector: "nav a[data-node='nav-pricing']" },
  }),
  createSegment({
    id: "ve-seg-nav-cta",
    index: 5,
    key: "nav.cta",
    sourceText: "Get started",
    targetText: "Loslegen",
    contextLabel: "Header CTA",
    status: "reviewed",
    sourcePath: "pages/home.json",
    tags: ["nav", "cta"],
    maxLength: 20,
    node: { tagName: "BUTTON", selector: "header button[data-node='nav-cta']" },
  }),
  createSegment({
    id: "ve-seg-hero-title",
    index: 6,
    key: "hero.title",
    sourceText: "The platform for modern teams",
    targetText: "Die Plattform für moderne Teams",
    contextLabel: "Hero headline",
    status: "needs_review",
    sourcePath: "pages/home.json",
    tags: ["hero", "high impact"],
    maxLength: 60,
    comments: [
      {
        id: "ve-comment-1",
        type: "comment",
        status: null,
        text: "Keep this confident but not salesy — product voice, not ad copy.",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        locale: TARGET_LOCALE,
        author: "Lukas",
      },
    ],
    node: { tagName: "H1", selector: "main h1[data-node='hero-title']" },
  }),
  createSegment({
    id: "ve-seg-hero-body",
    index: 7,
    key: "hero.body",
    sourceText:
      "Coordinate launches, keep terminology consistent, and ship every locale with confidence.",
    targetText:
      "Koordinieren Sie Releases, halten Sie Terminologie konsistent und liefern Sie jede Locale mit Zuversicht.",
    contextLabel: "Hero supporting copy",
    status: "needs_review",
    sourcePath: "pages/home.json",
    tags: ["hero"],
    maxLength: 140,
    node: { tagName: "P", selector: "main p[data-node='hero-body']" },
  }),
  createSegment({
    id: "ve-seg-hero-cta",
    index: 8,
    key: "hero.cta",
    sourceText: "Start free trial",
    targetText: "Kostenlos starten",
    contextLabel: "Hero primary CTA",
    status: "pending",
    sourcePath: "pages/home.json",
    tags: ["hero", "cta"],
    maxLength: 24,
    node: { tagName: "BUTTON", selector: "main button[data-node='hero-cta']" },
  }),
  createSegment({
    id: "ve-seg-hero-secondary",
    index: 9,
    key: "hero.secondary",
    sourceText: "Book a demo",
    targetText: "Demo buchen",
    contextLabel: "Hero secondary CTA",
    status: "reviewed",
    sourcePath: "pages/home.json",
    tags: ["hero", "cta"],
    maxLength: 24,
    node: { tagName: "BUTTON", selector: "main button[data-node='hero-secondary']" },
  }),
];

export const visualEditorPricingSegmentsFixture: CatVisualEditorSegment[] = [
  createSegment({
    id: "ve-seg-pricing-title",
    index: 1,
    key: "pricing.title",
    sourceText: "Simple pricing for every team",
    targetText: "Einfache Preise für jedes Team",
    contextLabel: "Pricing headline",
    status: "needs_review",
    sourcePath: "pages/pricing.json",
    tags: ["pricing"],
    maxLength: 48,
    node: { tagName: "H1", selector: "main h1[data-node='pricing-title']" },
  }),
  createSegment({
    id: "ve-seg-pricing-body",
    index: 2,
    key: "pricing.body",
    sourceText: "Start free, then scale seats and locales as you grow.",
    targetText: "Starten Sie kostenlos und skalieren Sie Sitze und Locales nach Bedarf.",
    contextLabel: "Pricing supporting copy",
    status: "pending",
    sourcePath: "pages/pricing.json",
    tags: ["pricing"],
    maxLength: 90,
    node: { tagName: "P", selector: "main p[data-node='pricing-body']" },
  }),
  createSegment({
    id: "ve-seg-pricing-cta",
    index: 3,
    key: "pricing.cta",
    sourceText: "Compare plans",
    targetText: "Tarife vergleichen",
    contextLabel: "Pricing CTA",
    status: "reviewed",
    sourcePath: "pages/pricing.json",
    tags: ["pricing", "cta"],
    maxLength: 24,
    node: { tagName: "BUTTON", selector: "main button[data-node='pricing-cta']" },
  }),
];

export const visualEditorHeroIntelligenceFixture: CatSegmentIntelligence = {
  reviewReason: "Hero headline sets product positioning; tone and glossary must stay consistent.",
  reviewRisk: "medium",
  intent: "Primary homepage headline introducing the product value proposition.",
  locationBreadcrumb: "Homepage > Hero",
  filePath: "pages/home.json",
  componentName: "HeroSection",
  productMeaning:
    "Hero section on the homepage. Primary headline introducing the product value proposition.",
  reviewerPreference: "Prefer “moderne Teams” over “zeitgemäße Teams” for brand voice.",
  constraints: "Max 60 characters · Single line on desktop",
  glossaryTerms: [
    {
      id: "ve-term-1",
      source: "modern teams",
      target: "moderne Teams",
      approved: true,
      forbidden: false,
    },
    {
      id: "ve-term-2",
      source: "platform",
      target: "Plattform",
      approved: true,
      forbidden: false,
    },
  ],
  translationMemoryMatches: [
    {
      id: "ve-tm-1",
      sourceText: "The workspace for modern teams",
      targetText: "Der Workspace für moderne Teams",
      matchPercent: 88,
      contextLabel: "Marketing hero",
    },
    {
      id: "ve-tm-2",
      sourceText: "Built for modern product teams",
      targetText: "Für moderne Produktteams gebaut",
      matchPercent: 74,
      contextLabel: "Feature page",
    },
  ],
  aiSuggestion: "Die Plattform für moderne Teams",
  aiReasoning: "Matches preferred glossary and keeps the headline punchy under the length limit.",
};

export const visualEditorPricingIntelligenceFixture: CatSegmentIntelligence = {
  reviewReason: "Pricing headlines are high visibility and length-sensitive.",
  reviewRisk: "medium",
  intent: "Pricing page headline that introduces plan simplicity.",
  locationBreadcrumb: "Pricing > Hero",
  filePath: "pages/pricing.json",
  componentName: "PricingHero",
  productMeaning: "Primary headline on the pricing page.",
  reviewerPreference: "Keep “Team” singular unless the German wording requires plural.",
  constraints: "Max 48 characters",
  glossaryTerms: [
    {
      id: "ve-term-pricing-1",
      source: "pricing",
      target: "Preise",
      approved: true,
      forbidden: false,
    },
  ],
  translationMemoryMatches: [
    {
      id: "ve-tm-pricing-1",
      sourceText: "Transparent pricing for growing teams",
      targetText: "Transparente Preise für wachsende Teams",
      matchPercent: 81,
      contextLabel: "Pricing hero",
    },
  ],
  aiSuggestion: "Einfache Preise für jedes Team",
  aiReasoning: "Keeps the offer clear and under the character limit.",
};

function createGenericPageSegments(
  sourcePath: string,
  idPrefix: string,
  title: { source: string; target: string },
): CatVisualEditorSegment[] {
  return [
    createSegment({
      id: `${idPrefix}-title`,
      index: 1,
      key: "page.title",
      sourceText: title.source,
      targetText: title.target,
      contextLabel: "Page headline",
      status: "needs_review",
      sourcePath,
      tags: ["page"],
      node: { tagName: "H1", selector: "main h1[data-node='page-title']" },
    }),
    createSegment({
      id: `${idPrefix}-body`,
      index: 2,
      key: "page.body",
      sourceText: "Review and localize the key copy for this page.",
      targetText: "Prüfen und lokalisieren Sie die wichtigsten Texte für diese Seite.",
      contextLabel: "Page body",
      status: "pending",
      sourcePath,
      tags: ["page"],
      node: { tagName: "P", selector: "main p[data-node='page-body']" },
    }),
  ];
}

function createFilePage(input: {
  sourcePath: string;
  previewUrl: string;
  previewKind: CatVisualEditorPreviewKind;
  progress: CatVisualEditorProgress;
  segments: CatVisualEditorSegment[];
  defaultSelectedSegmentId: string;
  primaryIntelligence: CatSegmentIntelligence;
}): CatVisualEditorFilePage {
  return {
    sourcePath: input.sourcePath,
    previewUrl: input.previewUrl,
    previewKind: input.previewKind,
    progress: input.progress,
    segments: input.segments,
    defaultSelectedSegmentId: input.defaultSelectedSegmentId,
    intelligenceBySegmentId: buildIntelligenceForSegments(input.segments, {
      segmentId: input.defaultSelectedSegmentId,
      intelligence: input.primaryIntelligence,
    }),
  };
}

export const visualEditorPagesBySourcePath: Record<string, CatVisualEditorFilePage> = {
  "pages/home.json": createFilePage({
    sourcePath: "pages/home.json",
    previewUrl: "https://acme.com/de/",
    previewKind: "home",
    progress: {
      locale: TARGET_LOCALE,
      percent: 67,
      translated: 143,
      inReview: 28,
      untranslated: 42,
    },
    segments: visualEditorHomeSegmentsFixture,
    defaultSelectedSegmentId: "ve-seg-hero-title",
    primaryIntelligence: visualEditorHeroIntelligenceFixture,
  }),
  "pages/pricing.json": createFilePage({
    sourcePath: "pages/pricing.json",
    previewUrl: "https://acme.com/de/pricing/",
    previewKind: "pricing",
    progress: {
      locale: TARGET_LOCALE,
      percent: 54,
      translated: 18,
      inReview: 6,
      untranslated: 9,
    },
    segments: visualEditorPricingSegmentsFixture,
    defaultSelectedSegmentId: "ve-seg-pricing-title",
    primaryIntelligence: visualEditorPricingIntelligenceFixture,
  }),
  "pages/features.json": createFilePage({
    sourcePath: "pages/features.json",
    previewUrl: "https://acme.com/de/features/",
    previewKind: "generic",
    progress: {
      locale: TARGET_LOCALE,
      percent: 71,
      translated: 34,
      inReview: 4,
      untranslated: 10,
    },
    segments: createGenericPageSegments("pages/features.json", "ve-seg-features", {
      source: "Features that keep launches on track",
      target: "Funktionen, die Releases im Plan halten",
    }),
    defaultSelectedSegmentId: "ve-seg-features-title",
    primaryIntelligence: {
      ...visualEditorPricingIntelligenceFixture,
      filePath: "pages/features.json",
      locationBreadcrumb: "Features > Hero",
      productMeaning: "Features page headline.",
      aiSuggestion: "Funktionen, die Releases im Plan halten",
    },
  }),
  "pages/about.json": createFilePage({
    sourcePath: "pages/about.json",
    previewUrl: "https://acme.com/de/about/",
    previewKind: "generic",
    progress: {
      locale: TARGET_LOCALE,
      percent: 80,
      translated: 22,
      inReview: 2,
      untranslated: 3,
    },
    segments: createGenericPageSegments("pages/about.json", "ve-seg-about", {
      source: "About Acme",
      target: "Über Acme",
    }),
    defaultSelectedSegmentId: "ve-seg-about-title",
    primaryIntelligence: {
      ...visualEditorPricingIntelligenceFixture,
      filePath: "pages/about.json",
      locationBreadcrumb: "About > Hero",
      productMeaning: "About page headline.",
      aiSuggestion: "Über Acme",
    },
  }),
  "pages/dashboard/overview.json": createFilePage({
    sourcePath: "pages/dashboard/overview.json",
    previewUrl: "https://acme.com/de/dashboard/",
    previewKind: "generic",
    progress: {
      locale: TARGET_LOCALE,
      percent: 48,
      translated: 41,
      inReview: 12,
      untranslated: 33,
    },
    segments: createGenericPageSegments("pages/dashboard/overview.json", "ve-seg-dashboard", {
      source: "Dashboard overview",
      target: "Dashboard-Übersicht",
    }),
    defaultSelectedSegmentId: "ve-seg-dashboard-title",
    primaryIntelligence: {
      ...visualEditorPricingIntelligenceFixture,
      filePath: "pages/dashboard/overview.json",
      locationBreadcrumb: "Dashboard > Overview",
      productMeaning: "Dashboard overview page headline.",
      aiSuggestion: "Dashboard-Übersicht",
    },
  }),
  "pages/help/getting-started.json": createFilePage({
    sourcePath: "pages/help/getting-started.json",
    previewUrl: "https://acme.com/de/help/getting-started/",
    previewKind: "generic",
    progress: {
      locale: TARGET_LOCALE,
      percent: 62,
      translated: 27,
      inReview: 5,
      untranslated: 12,
    },
    segments: createGenericPageSegments("pages/help/getting-started.json", "ve-seg-help", {
      source: "Getting started",
      target: "Erste Schritte",
    }),
    defaultSelectedSegmentId: "ve-seg-help-title",
    primaryIntelligence: {
      ...visualEditorPricingIntelligenceFixture,
      filePath: "pages/help/getting-started.json",
      locationBreadcrumb: "Help > Getting started",
      productMeaning: "Help article headline.",
      aiSuggestion: "Erste Schritte",
    },
  }),
};

export function createVisualEditorFixture(
  overrides: Partial<CatVisualEditorFixture> = {},
): CatVisualEditorFixture {
  return {
    files: visualEditorFilesFixture,
    selectedSourcePath: "pages/home.json",
    pagesBySourcePath: visualEditorPagesBySourcePath,
    ...overrides,
  };
}

export const visualEditorFixture = createVisualEditorFixture();

/** @deprecated Prefer pagesBySourcePath; kept for story imports that only need home segments. */
export const visualEditorProgressFixture =
  visualEditorPagesBySourcePath["pages/home.json"]!.progress;
