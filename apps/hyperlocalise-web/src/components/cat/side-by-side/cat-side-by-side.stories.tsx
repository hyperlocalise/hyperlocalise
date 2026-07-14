import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { CatWorkspaceContainer } from "@/components/cat/workspace/cat-workspace-container";
import {
  catIntelligenceFixture,
  createCatWorkspaceState,
  mockValidateFormat,
} from "@/components/cat/shared/cat.fixture";
import {
  CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY,
  writeCatWorkspaceViewMode,
} from "@/components/cat/workspace/cat-workspace-view-mode";

const meta = {
  title: "CAT/Side by side",
  component: CatWorkspaceContainer,
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
} satisfies Meta<typeof CatWorkspaceContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

const sideBySideArgs = {
  initialState: createCatWorkspaceState({
    segmentIntelligence: {
      "seg-02": {
        ...catIntelligenceFixture,
        agentContext:
          "Cached repository context: this card is rendered in the dashboard overview after a project sync.",
      },
    },
  }),
  navigation: {
    onSelectSegment: fn(),
    onPreviousSegment: fn(),
    onNextSegment: fn(),
    onReviewInSequence: fn(),
  },
  editing: {
    onTargetChange: fn(),
    onUseAiSuggestion: fn(),
  },
  review: {
    onApprove: fn(),
    onSaveDraft: fn(),
    onAskQuestion: fn(),
  },
  services: {
    validateFormat: mockValidateFormat,
    lookupSegmentContext: async () =>
      "Cached repository context: this card is rendered in the dashboard overview after a project sync.",
  },
} satisfies Story["args"];

export const Default: Story = {
  args: sideBySideArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Source string")).toBeInTheDocument();
    await expect(canvas.getByText("Translation")).toBeInTheDocument();
    await expect(canvas.getByText("dashboard.reviews.pending.card")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Target translation" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Find context/i })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^Approve/i })).not.toBeInTheDocument();
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
