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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { expect, userEvent, waitFor, within } from "storybook/test";

import {
  CAT_STORY_IMAGE_SOURCE_URL,
  CAT_STORY_IMAGE_TARGET_URL,
  CAT_STORY_VIDEO_SOURCE_URL,
  CAT_STORY_VIDEO_TARGET_URL,
} from "@/components/content-editor/file-view/content-editor-file-view.fixture";
import { contentEditorDocumentMswHandlers } from "@/components/content-editor/file-view/content-editor-document-msw-handlers";
import { contentEditorOfficeMswHandlers } from "@/components/content-editor/file-view/content-editor-office-msw-handlers";
import { mockValidateFormat } from "@/components/content-editor/shared/content-editor.fixture";

import {
  contentEditorPageShellDocxPath,
  contentEditorPageShellFilesFixture,
  contentEditorPageShellGuideMdxPath,
  contentEditorPageShellInitialSourcePath,
  contentEditorPageShellProductJsonPath,
  contentEditorPageShellTreeSamplePaths,
  contentEditorPageShellXlsxPath,
  createContentEditorPageShellWorkspaceBySourcePath,
} from "./content-editor-page-shell.fixture";
import { ContentEditorPageShellStoryView } from "./content-editor-page-shell.story-view";

const meta = {
  title: "CAT/Editor",
  component: ContentEditorPageShellStoryView,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [...contentEditorDocumentMswHandlers, ...contentEditorOfficeMswHandlers],
    },
    docs: {
      description: {
        component:
          "Full CAT page shell. Select files in the left tree to preview every supported editor format: PO, YAML, ARB, XLIFF, JSON/JSONC, HTML, strings, xcstrings, CSV, SRT, VTT, images, markdown, MDX, Word, Excel, PowerPoint, and video.",
      },
    },
  },
} satisfies Meta<typeof ContentEditorPageShellStoryView>;

export default meta;
type Story = StoryObj<typeof meta>;

async function selectFileInTree(canvasElement: HTMLElement, sourcePath: string) {
  await waitFor(() => {
    void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
  });

  const treeContainer = canvasElement.querySelector("file-tree-container");
  const fileRow = treeContainer?.shadowRoot?.querySelector(`[data-item-path="${sourcePath}"]`);
  if (!fileRow) {
    throw new Error(`Expected file tree row for ${sourcePath}`);
  }

  await userEvent.click(fileRow);
}

export const Default: Story = {
  args: {
    files: contentEditorPageShellFilesFixture,
    initialSelectedSourcePath: contentEditorPageShellInitialSourcePath,
    workspaceBySourcePath: createContentEditorPageShellWorkspaceBySourcePath(),
    navigation: {
      onSelectSegment: fn(),
      onPreviousSegment: fn(),
      onNextSegment: fn(),
      onReviewInSequence: fn(),
    },
    editing: {
      onTargetChange: fn(),
      onUseAiSuggestion: fn(),
      onRegenerateImage: fn(),
      onUploadImage: fn(),
    },
    review: {
      onApprove: fn(),
      onAskQuestion: fn(),
    },
    services: {
      validateFormat: mockValidateFormat,
      lookupSegmentContext: async () =>
        "Cached repository context: this card is rendered in the dashboard overview after a project sync.",
      generateAiRecommendation: async () => ({
        aiSuggestion: "Thẻ trên bảng điều khiển hiển thị số lượng đánh giá cần phê duyệt.",
        aiReasoning: "Matches the source meaning and dashboard tone.",
      }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("heading", { name: "Files" })).toBeInTheDocument();

    await waitFor(() => {
      void expect(canvasElement.querySelector("file-tree-container")).toBeTruthy();
    });

    const shadowRoot = canvasElement.querySelector("file-tree-container")?.shadowRoot;
    if (!shadowRoot) {
      throw new Error("Expected file tree shadow root");
    }

    for (const sourcePath of contentEditorPageShellTreeSamplePaths) {
      await expect(shadowRoot.querySelector(`[data-item-path="${sourcePath}"]`)).toBeTruthy();
    }

    await expect(canvas.getByText("Source string")).toBeInTheDocument();
    await expect(canvas.getByText("Translation")).toBeInTheDocument();
    await expect(canvas.getByText("dashboard.reviews.pending.card")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Target translation" })).toBeInTheDocument();

    await selectFileInTree(canvasElement, "marketing/hero.png");
    await waitFor(() =>
      expect(canvas.getByAltText("Localised image")).toHaveAttribute(
        "src",
        CAT_STORY_IMAGE_TARGET_URL,
      ),
    );
    await expect(canvas.getByAltText("Original image")).toHaveAttribute(
      "src",
      CAT_STORY_IMAGE_SOURCE_URL,
    );

    await selectFileInTree(canvasElement, "content/intro.md");
    await waitFor(() =>
      expect(
        canvas.getByRole("heading", { level: 1, name: "Getting started" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(canvas.getByRole("heading", { level: 1, name: "Bắt đầu" })).toBeInTheDocument(),
    );

    await selectFileInTree(canvasElement, contentEditorPageShellGuideMdxPath);
    await waitFor(() =>
      expect(
        canvas.getByRole("heading", { level: 1, name: "Component guide" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("heading", { level: 1, name: "Hướng dẫn thành phần" }),
      ).toBeInTheDocument(),
    );

    await selectFileInTree(canvasElement, contentEditorPageShellDocxPath);
    await waitFor(() => expect(canvas.getByText("Tóm tắt sản phẩm")).toBeInTheDocument(), {
      timeout: 15_000,
    });
    await expect(canvas.getByRole("button", { name: "Save edits" })).toBeEnabled();

    await selectFileInTree(canvasElement, contentEditorPageShellXlsxPath);
    await waitFor(() => expect(canvas.getByText("Chuỗi đã duyệt")).toBeInTheDocument(), {
      timeout: 15_000,
    });
    await expect(canvas.getByRole("button", { name: "Save edits" })).toBeEnabled();

    await selectFileInTree(canvasElement, "onboarding/walkthrough.mp4");
    await waitFor(() => expect(canvasElement.querySelectorAll("video")).toHaveLength(2));
    await expect(canvasElement.querySelectorAll("video")[0]).toHaveAttribute(
      "src",
      CAT_STORY_VIDEO_SOURCE_URL,
    );
    await expect(canvasElement.querySelectorAll("video")[1]).toHaveAttribute(
      "src",
      CAT_STORY_VIDEO_TARGET_URL,
    );

    await selectFileInTree(canvasElement, "decks/quarterly-review.pptx");
    await waitFor(() => expect(canvas.getByText("Tiến độ bản địa hóa")).toBeInTheDocument(), {
      timeout: 15_000,
    });
    await expect(canvas.getByText("Slide 1")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save edits" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Show source" })).toBeInTheDocument();

    await selectFileInTree(canvasElement, contentEditorPageShellProductJsonPath);
    await waitFor(() => expect(canvas.getByText("Source string")).toBeInTheDocument());
    await expect(canvas.getByText("dashboard.reviews.pending.card")).toBeInTheDocument();
  },
};
