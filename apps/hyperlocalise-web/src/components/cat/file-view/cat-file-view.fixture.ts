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
import {
  catIntelligenceFixture,
  createCatWorkspaceState,
} from "@/components/cat/shared/cat.fixture";
import type {
  CatFileContext,
  CatSegment,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "@/components/cat/shared/types";
import { toQueueSegment } from "@/components/cat/workspace/store/cat-segment-view";

const SOURCE_LOCALE = "en-US";
const TARGET_LOCALE = "vi";

export const CAT_STORY_IMAGE_SOURCE_URL =
  "https://placehold.co/960x540/1e293b/f8fafc/png?text=Source+hero";
export const CAT_STORY_IMAGE_TARGET_URL =
  "https://placehold.co/960x540/0f766e/ecfdf5/png?text=Translated+hero";
export const CAT_STORY_VIDEO_SOURCE_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
export const CAT_STORY_VIDEO_TARGET_URL =
  "https://www.w3.org/WAI/content-images/wai-videos/perspective-video-form-controls.mp4";

export const catImageFileIntelligenceFixture: CatSegmentIntelligence = {
  ...catIntelligenceFixture,
  reviewReason:
    "The hero image still carries English CTA copy. Localize the visual, not only the surrounding strings.",
  reviewRisk: "medium",
  intent: "Marketing hero image on the dashboard landing page.",
  locationBreadcrumb: "Marketing > Landing hero",
  filePath: "marketing/hero.png",
  componentName: "HeroBanner",
  productMeaning: "Hero image that introduces pending review work on the dashboard.",
  segmentType: "Image file",
  constraints: "Keep the product UI readable. Do not crop the CTA.",
  aiSuggestion: undefined,
  aiReasoning: undefined,
};

export const catVideoFileIntelligenceFixture: CatSegmentIntelligence = {
  ...catIntelligenceFixture,
  reviewReason:
    "On-screen captions and the spoken product name need a localized cut, not a subtitle overlay only.",
  reviewRisk: "high",
  intent: "Product walkthrough video for the onboarding flow.",
  locationBreadcrumb: "Onboarding > Walkthrough",
  filePath: "onboarding/walkthrough.mp4",
  componentName: "WalkthroughPlayer",
  productMeaning: "Short video that shows how reviewers approve translations.",
  segmentType: "Video file",
  constraints: "Keep the same runtime and safe-area captions.",
  aiSuggestion: undefined,
  aiReasoning: undefined,
};

export function createCatImageFileSegment(overrides: Partial<CatSegment> = {}): CatSegment {
  return {
    id: "seg-image-file",
    index: 1,
    key: "marketing/hero.png",
    sourceText: "marketing/hero.png",
    targetText: "",
    sourcePath: "marketing/hero.png",
    sourceLocale: SOURCE_LOCALE,
    targetLocale: TARGET_LOCALE,
    status: "needs_review",
    contextLabel: "Hero image",
    tags: ["image", "marketing"],
    contentKind: "image_file",
    sourceAssetUrl: CAT_STORY_IMAGE_SOURCE_URL,
    targetAssetUrl: CAT_STORY_IMAGE_TARGET_URL,
    ...overrides,
  };
}

export function createCatVideoFileSegment(overrides: Partial<CatSegment> = {}): CatSegment {
  return {
    id: "seg-video-file",
    index: 1,
    key: "onboarding/walkthrough.mp4",
    sourceText: "onboarding/walkthrough.mp4",
    targetText: "",
    sourcePath: "onboarding/walkthrough.mp4",
    sourceLocale: SOURCE_LOCALE,
    targetLocale: TARGET_LOCALE,
    status: "needs_review",
    contextLabel: "Walkthrough video",
    tags: ["video", "onboarding"],
    contentKind: "video_file",
    sourceAssetUrl: CAT_STORY_VIDEO_SOURCE_URL,
    targetAssetUrl: CAT_STORY_VIDEO_TARGET_URL,
    ...overrides,
  };
}

function createMediaFileContext(sourcePath: string, filename: string): CatFileContext {
  return {
    sourcePath,
    filename,
    sourceLocale: SOURCE_LOCALE,
    targetLocale: TARGET_LOCALE,
    providerKind: null,
    canEditTranslations: true,
    canAddComments: true,
  };
}

function createMediaWorkspaceState(
  segments: CatSegment[],
  selectedSegmentId: string,
  intelligence: CatSegmentIntelligence,
  fileContext: CatFileContext,
): CatWorkspaceState {
  return createCatWorkspaceState({
    segments,
    queueSegments: segments.map(toQueueSegment),
    selectedSegmentId,
    formatChecks: [],
    segmentFormatChecks: {},
    intelligence,
    segmentIntelligence: {
      [selectedSegmentId]: intelligence,
    },
    fileContext,
    breadcrumbs: ["Project", "HL-Test", "Files", fileContext.filename],
  });
}

export function createCatImageFileWorkspaceState(
  overrides: Partial<CatSegment> = {},
): CatWorkspaceState {
  const segment = createCatImageFileSegment(overrides);
  return createMediaWorkspaceState(
    [segment],
    segment.id,
    catImageFileIntelligenceFixture,
    createMediaFileContext(segment.sourcePath ?? "marketing/hero.png", "hero.png"),
  );
}

export function createCatVideoFileWorkspaceState(
  overrides: Partial<CatSegment> = {},
): CatWorkspaceState {
  const segment = createCatVideoFileSegment(overrides);
  return createMediaWorkspaceState(
    [segment],
    segment.id,
    catVideoFileIntelligenceFixture,
    createMediaFileContext(segment.sourcePath ?? "onboarding/walkthrough.mp4", "walkthrough.mp4"),
  );
}

export function createCatImageAndVideoWorkspaceState(): CatWorkspaceState {
  const imageSegment = createCatImageFileSegment({ index: 1 });
  const videoSegment = createCatVideoFileSegment({ index: 2 });
  const segments = [imageSegment, videoSegment];

  return createCatWorkspaceState({
    segments,
    queueSegments: segments.map(toQueueSegment),
    selectedSegmentId: imageSegment.id,
    formatChecks: [],
    segmentFormatChecks: {},
    intelligence: catImageFileIntelligenceFixture,
    segmentIntelligence: {
      [imageSegment.id]: catImageFileIntelligenceFixture,
      [videoSegment.id]: catVideoFileIntelligenceFixture,
    },
    fileContext: createMediaFileContext("All Files", "All Files"),
    breadcrumbs: ["Project", "HL-Test", "Files", "All Files"],
  });
}
