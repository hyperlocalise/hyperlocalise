import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { CatWorkspaceContainer } from "./cat-workspace-container";
import {
  catSegmentsFixture,
  catWorkspaceFixture,
  createCatWorkspaceState,
  mockValidateFormat,
} from "./cat.fixture";
import type { CatFormatCheck } from "./types";

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
      onAskQuestion: fn(),
    },
    services: {
      validateFormat: mockValidateFormat,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Queue")).toBeInTheDocument();
    await expect(canvas.getByText("Translation Intelligence")).toBeInTheDocument();
    await expect(canvas.getByText("Translation memory")).toBeInTheDocument();
    await expect(
      canvas.getByText("Dashboard card showing how many reviews still need approval."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="kbd"]')).toHaveLength(8);
  },
};

export const EmptyQueue: Story = {
  args: {
    initialState: createCatWorkspaceState({ segments: [], selectedSegmentId: "" }),
  },
};

export const MobileReview: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  args: {
    initialState: createCatWorkspaceState(),
    services: {
      validateFormat: mockValidateFormat,
      lookupSegmentContext: async () => "Found this string in the dashboard review card.",
    },
    review: { onApprove: fn() },
    editing: { onUseAiSuggestion: fn() },
  },
  play: async ({ args, canvasElement }) => {
    window.resizeTo(390, 844);
    window.dispatchEvent(new Event("resize"));

    const canvas = within(canvasElement);

    await waitFor(() => expect(canvas.getByRole("tab", { name: "Edit" })).toBeInTheDocument());
    await expect(canvas.getByRole("tab", { name: "Queue" })).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "AI" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Find context" }));
    await userEvent.click(canvas.getByRole("tab", { name: "AI" }));
    await expect(
      await canvas.findByText("Found this string in the dashboard review card."),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "Edit" }));
    await userEvent.click(canvas.getByRole("button", { name: "Use" }));
    await expect(args.editing?.onUseAiSuggestion).toHaveBeenCalled();

    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    await expect(args.review?.onApprove).toHaveBeenCalled();

    await userEvent.click(canvas.getByRole("tab", { name: "Queue" }));
    await userEvent.click(canvas.getByText("dashboard.reviews.pending.card"));
    await expect(canvas.getByRole("tab", { name: "Edit" })).toHaveAttribute("data-active");
  },
};

export const MobileEmptyQueue: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  args: {
    initialState: createCatWorkspaceState({ segments: [], selectedSegmentId: "" }),
  },
  play: async ({ canvasElement }) => {
    window.resizeTo(390, 844);
    window.dispatchEvent(new Event("resize"));

    const canvas = within(canvasElement);

    await expect(canvas.getByText("No segments in queue.")).toBeInTheDocument();
  },
};

export const InteractiveReview: Story = {
  args: {
    initialState: createCatWorkspaceState(),
    services: { validateFormat: mockValidateFormat },
    review: { onApprove: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const approveButton = canvas.getByRole("button", { name: "Approve" });
    const onApprove = args.review?.onApprove;
    if (!onApprove) {
      throw new Error("InteractiveReview requires an onApprove spy.");
    }

    const targetEditor = canvas.getByRole("textbox", { name: "Target translation" });
    await expect(targetEditor).toHaveTextContent(
      "Thẻ bảng điều khiển hiển thị số đánh giá còn cần phê duyệt.",
    );

    await userEvent.click(approveButton);
    await expect(onApprove).toHaveBeenCalled();
    await expect(canvas.getByText("50 total · 32 reviewed")).toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByText("Your review is ready for approval")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(targetEditor.textContent?.trim()).not.toContain(
        "Thẻ bảng điều khiển hiển thị số đánh giá còn cần phê duyệt.",
      ),
    );
  },
};

export const PluralIcuSegment: Story = {
  args: {
    initialState: createCatWorkspaceState({
      selectedSegmentId: "seg-06",
      formatChecks: [
        {
          id: "check-icu",
          label: "Placeholders & ICU",
          status: "pass",
          message: "Target keeps the required placeholders and ICU structure.",
          category: "icu",
          relatedTokens: ["{count, plural}"],
        } satisfies CatFormatCheck,
      ],
    }),
    services: { validateFormat: mockValidateFormat },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("ICU structure")).toBeInTheDocument();
    await expect(canvas.getAllByText("count").at(0)).toBeInTheDocument();
    await expect(canvas.getByText("plural")).toBeInTheDocument();
    await expect(canvas.getAllByText("one").at(0)).toBeInTheDocument();
    await expect(canvas.getAllByText("other").at(0)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "{count, plural}" })).toBeInTheDocument();
  },
};

const placeholderSegments = catSegmentsFixture.map((segment) =>
  segment.id === "seg-13"
    ? {
        ...segment,
        targetText: "Bản dịch thiếu biến giữ chỗ.",
      }
    : segment,
);

export const MissingPlaceholderSegment: Story = {
  args: {
    initialState: createCatWorkspaceState({
      segments: placeholderSegments,
      selectedSegmentId: "seg-13",
      formatChecks: [
        {
          id: "check-format-missing-token",
          label: "Missing placeholders",
          status: "fail",
          message: "Target is missing {name} from the source string.",
          category: "placeholder",
          relatedTokens: ["{name}"],
        } satisfies CatFormatCheck,
      ],
    }),
    services: { validateFormat: mockValidateFormat },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Required tokens")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "{name}" })).toBeInTheDocument();
    await expect(canvas.getByText("Missing placeholders")).toBeInTheDocument();
    await expect(
      canvas.getByText("Target is missing {name} from the source string."),
    ).toBeInTheDocument();
  },
};
