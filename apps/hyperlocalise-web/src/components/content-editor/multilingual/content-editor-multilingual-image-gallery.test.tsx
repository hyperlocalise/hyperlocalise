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
// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { contentEditorSegmentsFixture } from "@/components/content-editor/shared/content-editor.fixture";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { ContentEditorImageGenerationStore } from "./content-editor-image-generation-store";
import { ContentEditorMultilingualImageGallery } from "./content-editor-multilingual-image-gallery";
import type { ContentEditorMultilingualConfig } from "./content-editor-multilingual-table";

const { targetQuery } = vi.hoisted(() => ({ targetQuery: vi.fn() }));
vi.mock("@/components/content-editor/project-file/use-content-editor-segment-target", () => ({
  useContentEditorSegmentTarget: targetQuery,
}));

const segment: ContentEditorSegment = {
  ...contentEditorSegmentsFixture[0],
  id: "hero",
  key: "hero.png",
  contentKind: "image_file",
  sourceText: "",
  sourceAssetUrl: "/api/orgs/acme/projects/p1/assets/hero",
};

function baseConfig(overrides: Partial<ContentEditorMultilingualConfig> = {}) {
  return {
    onSaveTranslation: vi.fn(),
    organizationSlug: "acme",
    projectId: "p1",
    sourcePath: "hero.png",
    sourceLocale: "en",
    targetLocales: ["fr", "de"],
    ...overrides,
  } satisfies ContentEditorMultilingualConfig;
}

function show(
  config: ContentEditorMultilingualConfig,
  onOpenTranslation = vi.fn<(segment: ContentEditorSegment, locale: string) => void>(),
  segments: ContentEditorSegment[] = [segment],
  generations?: ContentEditorImageGenerationStore,
) {
  const view = renderWithContentEditorProviders(
    <ContentEditorMultilingualImageGallery
      config={config}
      segments={segments}
      generations={generations}
      onOpenTranslation={onOpenTranslation}
    />,
  );
  return { onOpenTranslation, ...view };
}

beforeEach(() => {
  targetQuery.mockImplementation(({ targetLocale }: { targetLocale: string }) => ({
    data:
      targetLocale === "fr"
        ? { text: "", isApproved: true, targetAssetUrl: "/assets/hero-fr.png" }
        : undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("multilingual image gallery", () => {
  it("shows the original next to every locale's image", () => {
    show(baseConfig());

    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "French image" })).toHaveAttribute(
      "src",
      "/assets/hero-fr.png",
    );
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Not localised yet")).toBeInTheDocument();
    expect(targetQuery).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "de", externalStringId: "hero", priority: false }),
    );
  });

  it("shows the loading card while a locale generates and clears it when done", async () => {
    let finish!: () => void;
    const onRegenerateImage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    show(baseConfig({ onRegenerateImage }));

    await user.click(screen.getByRole("button", { name: "Localise image for German" }));

    expect(onRegenerateImage).toHaveBeenCalledWith(segment, "de", {
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole("progressbar", { name: "Generating image" })).toBeInTheDocument();
    expect(screen.getByText("Localising 1 image…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Localise image for German" })).toBeDisabled();

    finish();
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
  });

  it("keeps generation progress after the gallery remounts on the same store", async () => {
    const generations = new ContentEditorImageGenerationStore();
    let finish!: () => void;
    const onRegenerateImage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { unmount } = show(baseConfig({ onRegenerateImage }), undefined, [segment], generations);

    await user.click(screen.getByRole("button", { name: "Localise image for German" }));
    expect(screen.getByRole("progressbar", { name: "Generating image" })).toBeInTheDocument();

    unmount();
    show(baseConfig({ onRegenerateImage }), undefined, [segment], generations);

    expect(screen.getByRole("progressbar", { name: "Generating image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Localise image for German" })).toBeDisabled();
    expect(onRegenerateImage).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
  });

  it("reports a failed generation on that locale's card", async () => {
    const onRegenerateImage = vi.fn().mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    show(baseConfig({ onRegenerateImage }));

    await user.click(screen.getByRole("button", { name: "Regenerate image for French" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Regenerate" }),
    );

    expect(onRegenerateImage).toHaveBeenCalledWith(segment, "fr", {
      force: true,
      signal: expect.any(AbortSignal),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not localise this image. Try again.",
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("asks before regenerating an approved image and skips when cancelled", async () => {
    const onRegenerateImage = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    show(baseConfig({ onRegenerateImage }));

    await user.click(screen.getByRole("button", { name: "Regenerate image for French" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Replace the approved French image?");
    expect(onRegenerateImage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRegenerateImage).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not request targets for non-image segments in a mixed queue", () => {
    const copy: ContentEditorSegment = {
      ...contentEditorSegmentsFixture[0],
      id: "headline",
      key: "headline",
      contentKind: "text",
      sourcePath: "locales/en.json",
    };
    const video: ContentEditorSegment = {
      ...contentEditorSegmentsFixture[0],
      id: "promo",
      key: "promo.mp4",
      contentKind: "video_file",
      sourcePath: "promo.mp4",
    };
    show(baseConfig(), undefined, [copy, segment, video]);

    expect(targetQuery).toHaveBeenCalledTimes(2);
    expect(targetQuery).toHaveBeenCalledWith(expect.objectContaining({ externalStringId: "hero" }));
    expect(targetQuery).not.toHaveBeenCalledWith(
      expect.objectContaining({ externalStringId: "headline" }),
    );
    expect(targetQuery).not.toHaveBeenCalledWith(
      expect.objectContaining({ externalStringId: "promo" }),
    );
    expect(screen.queryByText("headline")).not.toBeInTheDocument();
  });

  it("hides generation without edit access and still opens a locale", async () => {
    const user = userEvent.setup();
    const { onOpenTranslation } = show(baseConfig({ canEdit: false, onRegenerateImage: vi.fn() }));

    expect(screen.queryByRole("button", { name: /Localise image for/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open German image in the editor" }));
    expect(onOpenTranslation).toHaveBeenCalledWith(segment, "de");
  });
});
