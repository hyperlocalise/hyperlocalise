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

import { ContentEditorWorkspaceContainer } from "@/components/content-editor/workspace/content-editor-workspace-container";
import {
  contentEditorIntelligenceFixture,
  createContentEditorWorkspaceState,
  mockValidateFormat,
} from "@/components/content-editor/shared/content-editor.fixture";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";
import { toQueueSegment } from "@/components/content-editor/workspace/store/content-editor-segment-view";
import {
  CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY,
  writeCatWorkspaceViewMode,
} from "@/components/content-editor/workspace/content-editor-workspace-view-mode";

const meta = {
  title: "CAT/Side by side",
  component: ContentEditorWorkspaceContainer,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => {
      writeCatWorkspaceViewMode("side-by-side");
      return (
        <div className="h-svh min-w-[1100px] bg-background text-foreground">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ContentEditorWorkspaceContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

const treatAsImageSegment: ContentEditorSegment = {
  id: "seg-image-url",
  index: 3,
  key: "assets.dashboard.hero",
  sourceText: "https://placehold.co/640x360/png",
  targetText: "",
  sourceLocale: "en-US",
  targetLocale: "vi",
  status: "pending",
  contextLabel: "Hero image URL",
  tags: ["image", "url"],
  looksLikeImageUrl: true,
};

function createSideBySideState() {
  const base = createContentEditorWorkspaceState({
    segmentIntelligence: {
      "seg-02": {
        ...contentEditorIntelligenceFixture,
        agentContext:
          "Cached repository context: this card is rendered in the dashboard overview after a project sync.",
      },
    },
  });
  const segments = [...(base.segments ?? [])];
  const insertAt = Math.max(segments.findIndex((segment) => segment.id === "seg-02") + 1, 0);
  segments.splice(insertAt, 0, treatAsImageSegment);
  const indexedSegments = segments.map((segment, index) => ({
    ...segment,
    index: index + 1,
  }));

  return {
    ...base,
    segments: indexedSegments,
    queueSegments: indexedSegments.map(toQueueSegment),
    formatChecks: [],
    segmentFormatChecks: {},
  };
}

async function delayedMockValidateFormat(
  ...args: Parameters<typeof mockValidateFormat>
): ReturnType<typeof mockValidateFormat> {
  const delayMs = 350 + Math.floor(Math.random() * 650);
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
  return mockValidateFormat(...args);
}

const sideBySideArgs = {
  initialState: createSideBySideState(),
  navigation: {
    onSelectSegment: fn(),
    onPreviousSegment: fn(),
    onNextSegment: fn(),
    onReviewInSequence: fn(),
  },
  editing: {
    onTargetChange: fn(),
    onUseAiSuggestion: fn(),
    onTreatAsImage: fn(),
    onTreatAsVideo: fn(),
  },
  review: {
    onApprove: fn(),
    onSaveDraft: fn(),
    onAskQuestion: fn(),
    onAddToIssueSheet: fn(),
  },
  services: {
    validateFormat: delayedMockValidateFormat,
    lookupSegmentContext: async () =>
      "Cached repository context: this card is rendered in the dashboard overview after a project sync.",
    generateAiRecommendation: async () => ({
      aiSuggestion: "Thẻ trên bảng điều khiển hiển thị số lượng đánh giá cần phê duyệt.",
      aiReasoning: "Matches the source meaning and dashboard tone.",
    }),
  },
} satisfies Story["args"];

export const Default: Story = {
  args: sideBySideArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Source string")).toBeInTheDocument();
    await expect(canvas.getByText("Translation")).toBeInTheDocument();
    await expect(
      canvas.getByRole("separator", { name: "Resize translation intelligence panel" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("dashboard.reviews.pending.card")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Target translation" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Copy source/i })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Clear target/i })).toBeInTheDocument();
    await expect(canvas.getByText(/AI recommendation/i)).toBeInTheDocument();
    await waitFor(
      () => expect(canvas.getByRole("img", { name: /Format & QA warning/i })).toBeInTheDocument(),
      { timeout: 3000 },
    );
    await expect(canvas.queryByText(/Format & QA checks/i)).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /^Board$/i })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Find context/i })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^Approve/i })).not.toBeInTheDocument();
    await expect(canvas.queryByText(/ICU structure/i)).not.toBeInTheDocument();

    const imageKey = canvas.getByText("assets.dashboard.hero");
    const imageRow = imageKey.closest(".grid.grid-cols-2");
    await expect(imageRow).not.toBeNull();
    await userEvent.click(
      within(imageRow as HTMLElement).getByRole("button", { name: /Click to translate/i }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: /Treat as image/i })).toBeInTheDocument(),
    );
    await expect(canvas.getByText("https://placehold.co/640x360/png")).toBeInTheDocument();
  },
};

export const DirtySaveActions: Story = {
  args: sideBySideArgs,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const targetEditor = await canvas.findByRole("textbox", { name: "Target translation" });

    await userEvent.click(targetEditor);
    await userEvent.keyboard("{Control>}a{/Control}Updated SBS translation");

    await waitFor(() =>
      expect(canvas.getByRole("button", { name: /^Approve/i })).toBeInTheDocument(),
    );
    await expect(canvas.getByRole("button", { name: /Save as draft/i })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: /Save as draft/i }));
    await expect(args.review?.onSaveDraft).toHaveBeenCalled();

    await waitFor(() =>
      expect(canvas.queryByRole("button", { name: /^Approve/i })).not.toBeInTheDocument(),
    );

    await userEvent.click(targetEditor);
    await userEvent.keyboard("!");

    await waitFor(() =>
      expect(canvas.getByRole("button", { name: /^Approve/i })).toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Approve/i }));
    await expect(args.review?.onApprove).toHaveBeenCalled();
  },
};

export const ComfortableFallbackOnMobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  decorators: [
    (Story) => {
      writeCatWorkspaceViewMode("side-by-side");
      return (
        <div className="h-svh bg-background text-foreground">
          <Story />
        </div>
      );
    },
  ],
  args: sideBySideArgs,
  play: async ({ canvasElement }) => {
    window.resizeTo(390, 844);
    window.dispatchEvent(new Event("resize"));

    const canvas = within(canvasElement);

    await waitFor(() => expect(canvas.getByRole("tab", { name: "Edit" })).toBeInTheDocument());
    await expect(canvas.getByRole("tab", { name: "Queue" })).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "AI" })).toBeInTheDocument();
    await expect(canvas.queryByText("Source string")).not.toBeInTheDocument();
  },
};

export const PersistenceRoundTrip: Story = {
  args: sideBySideArgs,
  play: async ({ canvasElement }) => {
    await expect(window.localStorage.getItem(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY)).toBe(
      "side-by-side",
    );

    const canvas = within(canvasElement);
    await expect(canvas.getByText("Source string")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: /Side by side/i }));
    await userEvent.click(canvas.getByRole("menuitemradio", { name: /Comfortable/i }));

    await waitFor(() => expect(canvas.getByText("Queue")).toBeInTheDocument());
    await expect(window.localStorage.getItem(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY)).toBe(
      "comfortable",
    );
  },
};
