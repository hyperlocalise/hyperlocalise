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
import type { CatSegment, CatSegmentIntelligence } from "@/components/cat/shared/types";

export type CatVisualEditorDevice = "desktop" | "tablet" | "mobile";

export type CatVisualEditorNodeMeta = {
  tagName: "H1" | "H2" | "P" | "A" | "BUTTON" | "SPAN";
  selector: string;
};

export type CatVisualEditorSegment = CatSegment & {
  node: CatVisualEditorNodeMeta;
};

export type CatVisualEditorProgress = {
  locale: string;
  percent: number;
  translated: number;
  inReview: number;
  untranslated: number;
};

export type CatVisualEditorFixture = {
  files: ProjectFileRecord[];
  selectedSourcePath: string;
  previewUrl: string;
  progress: CatVisualEditorProgress;
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string;
  intelligenceBySegmentId: Record<string, CatSegmentIntelligence>;
};

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

export const visualEditorProgressFixture: CatVisualEditorProgress = {
  locale: TARGET_LOCALE,
  percent: 67,
  translated: 143,
  inReview: 28,
  untranslated: 42,
};

export function createVisualEditorFixture(
  overrides: Partial<CatVisualEditorFixture> = {},
): CatVisualEditorFixture {
  const segments = overrides.segments ?? visualEditorHomeSegmentsFixture;
  const selectedSegmentId = overrides.selectedSegmentId ?? "ve-seg-hero-title";

  const { intelligenceBySegmentId: intelligenceOverride, ...restOverrides } = overrides;

  return {
    files: visualEditorFilesFixture,
    selectedSourcePath: "pages/home.json",
    previewUrl: "https://acme.com/de/",
    progress: visualEditorProgressFixture,
    ...restOverrides,
    segments,
    selectedSegmentId,
    intelligenceBySegmentId: {
      "ve-seg-hero-title": visualEditorHeroIntelligenceFixture,
      ...Object.fromEntries(
        segments
          .filter((segment) => segment.id !== "ve-seg-hero-title")
          .map((segment) => [
            segment.id,
            {
              ...visualEditorHeroIntelligenceFixture,
              intent: segment.contextLabel ?? segment.key,
              productMeaning: segment.contextLabel
                ? `${segment.contextLabel} on the homepage preview.`
                : visualEditorHeroIntelligenceFixture.productMeaning,
              aiSuggestion: segment.targetText || segment.sourceText,
              glossaryTerms: visualEditorHeroIntelligenceFixture.glossaryTerms,
              translationMemoryMatches: [],
            } satisfies CatSegmentIntelligence,
          ]),
      ),
      ...intelligenceOverride,
    },
  };
}

export const visualEditorFixture = createVisualEditorFixture();
