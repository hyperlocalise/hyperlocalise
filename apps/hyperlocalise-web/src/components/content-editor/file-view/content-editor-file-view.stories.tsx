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
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { ContentEditorWorkspaceState } from "@/components/content-editor/shared/types";
import { ContentEditorWorkspaceContainer } from "@/components/content-editor/workspace/content-editor-workspace-container";
import {
  CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY,
  writeCatWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";

import {
  CAT_STORY_IMAGE_SOURCE_URL,
  CAT_STORY_IMAGE_TARGET_URL,
  CAT_STORY_VIDEO_SOURCE_URL,
  CAT_STORY_VIDEO_TARGET_URL,
  createCatDocumentAndImageWorkspaceState,
  createCatDocumentFileWorkspaceState,
  createCatDocumentMdxFileWorkspaceState,
  createCatImageAndVideoWorkspaceState,
  createCatImageFileWorkspaceState,
  createCatVideoFileWorkspaceState,
} from "./content-editor-file-view.fixture";
import {
  CAT_STORY_DOCUMENT_ERROR_TARGET_URL,
  contentEditorDocumentMswHandlers,
} from "./content-editor-document-msw-handlers";

const meta = {
  title: "CAT/File view",
  component: ContentEditorWorkspaceContainer,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => {
      writeCatWorkspaceViewMode("file");
      return (
        <div className="h-svh bg-background text-foreground">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ContentEditorWorkspaceContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

const mediaEditing = {
  onTargetChange: fn(),
  onUseAiSuggestion: fn(),
  onRegenerateImage: fn(),
  onUploadImage: fn(),
};

const mediaNavigation = {
  onSelectSegment: fn(),
  onPreviousSegment: fn(),
  onNextSegment: fn(),
  onReviewInSequence: fn(),
};

const mediaReview = {
  onApprove: fn(),
  onAskQuestion: fn(),
};

const documentMswParameters = {
  msw: {
    handlers: contentEditorDocumentMswHandlers,
  },
} as const;

function fileViewArgs(initialState: ContentEditorWorkspaceState): Story["args"] {
  return {
    initialState,
    initialViewMode: "file",
    navigation: mediaNavigation,
    editing: mediaEditing,
    review: mediaReview,
  };
}

function viewModeButtons(canvas: ReturnType<typeof within>) {
  return canvas.getAllByRole("button", { name: "Content Editor view mode" });
}

async function expectDocumentFileViewChrome(canvas: ReturnType<typeof within>, filename: string) {
  await expect(viewModeButtons(canvas).length).toBeGreaterThan(0);
  await expect(canvas.getByText(filename)).toBeInTheDocument();
  await expect(canvas.getByRole("heading", { name: /Translated \(vi\)/i })).toBeInTheDocument();
  await expect(canvas.getByRole("heading", { name: /Source \(en-US\)/i })).toBeInTheDocument();
  await expect(canvas.getByRole("button", { name: /Generate|Regenerate/i })).toBeInTheDocument();
  await expect(canvas.getByText("Upload translated file")).toBeInTheDocument();
}

async function expectFileViewChrome(canvas: ReturnType<typeof within>, filename: string) {
  await expect(viewModeButtons(canvas).length).toBeGreaterThan(0);
  await expect(canvas.getByText(filename)).toBeInTheDocument();
  await expect(canvas.getByRole("heading", { name: /Translated \(vi\)/i })).toBeInTheDocument();
  await expect(canvas.getByRole("heading", { name: /Source \(en-US\)/i })).toBeInTheDocument();
  await expect(canvas.getByRole("button", { name: /Generate|Regenerate/i })).toBeInTheDocument();
  await expect(canvas.getByText("Upload translated file")).toBeInTheDocument();
}

async function switchToComfortable(canvas: ReturnType<typeof within>) {
  await userEvent.click(viewModeButtons(canvas)[0]);
  await userEvent.click(canvas.getByRole("menuitemradio", { name: /Comfortable/i }));
}

export const ImageFile: Story = {
  args: fileViewArgs(createCatImageFileWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectFileViewChrome(canvas, "marketing/hero.png");
    await expect(canvas.getByAltText("Translated image")).toHaveAttribute(
      "src",
      CAT_STORY_IMAGE_TARGET_URL,
    );
    await expect(canvas.getByAltText("Source image")).toHaveAttribute(
      "src",
      CAT_STORY_IMAGE_SOURCE_URL,
    );
    await expect(canvas.getByRole("button", { name: /^Approve$/i })).toBeEnabled();
  },
};

export const ImageFileEmptyTarget: Story = {
  args: fileViewArgs(createCatImageFileWorkspaceState({ targetAssetUrl: null })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectFileViewChrome(canvas, "marketing/hero.png");
    await expect(canvas.getByText("No translated file yet")).toBeInTheDocument();
    await expect(canvas.getByAltText("Source image")).toHaveAttribute(
      "src",
      CAT_STORY_IMAGE_SOURCE_URL,
    );
    await expect(canvas.getByRole("button", { name: /^Approve$/i })).toBeDisabled();
  },
};

export const ImageFileComfortable: Story = {
  args: fileViewArgs(createCatImageFileWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectFileViewChrome(canvas, "marketing/hero.png");
    await switchToComfortable(canvas);

    await waitFor(() => expect(canvas.getByText("Queue")).toBeInTheDocument());
    await expect(canvas.getByAltText("Source image")).toHaveAttribute(
      "src",
      CAT_STORY_IMAGE_SOURCE_URL,
    );
    await expect(canvas.getByAltText("Target image")).toHaveAttribute(
      "src",
      CAT_STORY_IMAGE_TARGET_URL,
    );
    await expect(
      canvas.getAllByRole("button", { name: /Regenerate image/i }).length,
    ).toBeGreaterThan(0);
    await expect(canvas.getByText("Upload image")).toBeInTheDocument();
  },
};

export const VideoFile: Story = {
  args: fileViewArgs(createCatVideoFileWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectFileViewChrome(canvas, "onboarding/walkthrough.mp4");
    const videos = canvasElement.querySelectorAll("video");
    await expect(videos).toHaveLength(2);
    await expect(videos[0]).toHaveAttribute("src", CAT_STORY_VIDEO_SOURCE_URL);
    await expect(videos[1]).toHaveAttribute("src", CAT_STORY_VIDEO_TARGET_URL);
    await expect(canvas.getByRole("button", { name: /^Approve$/i })).toBeEnabled();
  },
};

export const VideoFileEmptyTarget: Story = {
  args: fileViewArgs(createCatVideoFileWorkspaceState({ targetAssetUrl: null })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectFileViewChrome(canvas, "onboarding/walkthrough.mp4");
    await expect(canvas.getByText("No translated file yet")).toBeInTheDocument();
    const videos = canvasElement.querySelectorAll("video");
    await expect(videos).toHaveLength(1);
    await expect(videos[0]).toHaveAttribute("src", CAT_STORY_VIDEO_SOURCE_URL);
    await expect(canvas.getByRole("button", { name: /^Approve$/i })).toBeDisabled();
  },
};

export const VideoFileComfortable: Story = {
  args: fileViewArgs(createCatVideoFileWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectFileViewChrome(canvas, "onboarding/walkthrough.mp4");
    await switchToComfortable(canvas);

    await waitFor(() => expect(canvas.getByText("Queue")).toBeInTheDocument());
    const videos = canvasElement.querySelectorAll("video");
    await expect(videos).toHaveLength(2);
    await expect(videos[0]).toHaveAttribute("src", CAT_STORY_VIDEO_SOURCE_URL);
    await expect(videos[1]).toHaveAttribute("src", CAT_STORY_VIDEO_TARGET_URL);
    await expect(
      canvas.getAllByRole("button", { name: /Regenerate video/i }).length,
    ).toBeGreaterThan(0);
    await expect(canvas.getByText("Upload video")).toBeInTheDocument();
  },
};

export const ImageAndVideoQueue: Story = {
  args: fileViewArgs(createCatImageAndVideoWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectFileViewChrome(canvas, "marketing/hero.png");
    await expect(canvas.getByAltText("Source image")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: /Next file/i }));
    await waitFor(() => expect(canvas.getByText("onboarding/walkthrough.mp4")).toBeInTheDocument());
    await expect(canvasElement.querySelectorAll("video").length).toBeGreaterThan(0);
    await expect(canvas.queryByAltText("Source image")).not.toBeInTheDocument();

    await expect(window.localStorage.getItem(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY)).toBe("file");
  },
};

export const DocumentFile: Story = {
  parameters: documentMswParameters,
  args: fileViewArgs(createCatDocumentFileWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDocumentFileViewChrome(canvas, "content/intro.md");
    await waitFor(() =>
      expect(
        canvas.getByRole("heading", { level: 1, name: "Getting started" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(canvas.getByRole("heading", { level: 1, name: "Bắt đầu" })).toBeInTheDocument(),
    );
    await expect(canvas.getByText("Document properties")).toBeInTheDocument();
    const titleField = canvasElement.querySelector<HTMLInputElement>(
      "#content-editor-document-field-target-title",
    );
    await expect(titleField).toHaveValue("Bắt đầu");
    await expect(canvas.getByRole("button", { name: /^Approve$/i })).toBeEnabled();
  },
};

export const DocumentFileEmptyTarget: Story = {
  parameters: documentMswParameters,
  args: fileViewArgs(createCatDocumentFileWorkspaceState({ targetAssetUrl: null })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDocumentFileViewChrome(canvas, "content/intro.md");
    await expect(canvas.getByRole("button", { name: /^Generate$/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvas.getByRole("heading", { level: 1, name: "Getting started" }),
      ).toBeInTheDocument(),
    );
    await expect(canvas.getByRole("button", { name: /^Approve$/i })).toBeDisabled();
  },
};

export const DocumentFileWithMdx: Story = {
  parameters: documentMswParameters,
  args: fileViewArgs(createCatDocumentMdxFileWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDocumentFileViewChrome(canvas, "content/guide.mdx");
    const editor = await canvas.findByLabelText("Translated document");
    await expect(editor).toHaveValue(expect.stringContaining('<Callout type="info">'));
    await expect(editor).toHaveValue(expect.stringContaining("<kbd>Esc</kbd>"));
    await expect(canvas.getByRole("button", { name: /Save edits/i })).toBeInTheDocument();
  },
};

export const DocumentFileLoadError: Story = {
  parameters: documentMswParameters,
  args: fileViewArgs(
    createCatDocumentFileWorkspaceState({ targetAssetUrl: CAT_STORY_DOCUMENT_ERROR_TARGET_URL }),
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDocumentFileViewChrome(canvas, "content/intro.md");
    await waitFor(() =>
      expect(canvas.getByText("Could not load the translated file")).toBeInTheDocument(),
    );
    await expect(canvas.queryByLabelText("Translated document")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /^Approve$/i })).toBeDisabled();
  },
};

export const DocumentAndImageQueue: Story = {
  parameters: documentMswParameters,
  args: fileViewArgs(createCatDocumentAndImageWorkspaceState()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expectDocumentFileViewChrome(canvas, "content/intro.md");
    await waitFor(() =>
      expect(canvas.getByRole("heading", { level: 1, name: "Bắt đầu" })).toBeInTheDocument(),
    );

    await userEvent.click(canvas.getByRole("button", { name: /Next file/i }));
    await waitFor(() => expect(canvas.getByText("marketing/hero.png")).toBeInTheDocument());
    await expect(canvas.getByAltText("Source image")).toBeInTheDocument();
    await expect(canvas.queryByLabelText("Translated document")).not.toBeInTheDocument();
  },
};
