import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { expect, userEvent, within } from "storybook/test";

import { CatWorkspaceContainer } from "./cat-workspace-container";
import { catWorkspaceFixture, createCatWorkspaceState, mockValidateFormat } from "./cat.fixture";

const actionLog = {
  onSelectSegment: fn(),
  onApprove: fn(),
  onUseSuggestion: fn(),
  onRefresh: fn(),
  onRunWithAgent: fn(),
};

const meta = {
  title: "CAT/Workspace",
  component: CatWorkspaceContainer,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-svh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CatWorkspaceContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialState: catWorkspaceFixture,
    dependencies: {
      navigation: {
        onSelectSegment: actionLog.onSelectSegment,
        onPreviousSegment: fn(),
        onNextSegment: fn(),
        onReviewInSequence: fn(),
      },
      editing: {
        onTargetChange: fn(),
        onUseSuggestion: actionLog.onUseSuggestion,
        onUseAiSuggestion: fn(),
      },
      review: {
        onApprove: actionLog.onApprove,
        onRequestChanges: fn(),
        onAskQuestion: fn(),
        onSkip: fn(),
      },
      toolbar: {
        onRefresh: actionLog.onRefresh,
        onOpenExternal: fn(),
        onRunWithAgent: actionLog.onRunWithAgent,
      },
      services: {
        validateFormat: mockValidateFormat,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Queue")).toBeInTheDocument();
    await expect(canvas.getByText("Translation Intelligence")).toBeInTheDocument();
    await expect(
      canvas.getByText("Dashboard card showing how many reviews still need approval."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    await expect(canvas.getByText("Run with agent")).toBeInTheDocument();
  },
};

export const EmptyQueue: Story = {
  args: {
    initialState: createCatWorkspaceState({ segments: [], selectedSegmentId: "" }),
  },
};

export const InteractiveReview: Story = {
  args: {
    initialState: createCatWorkspaceState(),
    dependencies: {
      services: { validateFormat: mockValidateFormat },
      review: { onApprove: actionLog.onApprove },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approveButton = canvas.getByRole("button", { name: "Approve" });

    await userEvent.click(approveButton);
    await expect(actionLog.onApprove).toHaveBeenCalled();
    await expect(canvas.getByText("Reviewed")).toBeInTheDocument();
  },
};
