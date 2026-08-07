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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type {
  CatSegment,
  CatSegmentComment,
  CatSegmentCommentInput,
} from "@/components/cat/shared/types";

import { CatEditorCommentsSection } from "./cat-editor-comments-section";
import {
  catEditorCommentsFixture,
  createCatEditorCommentsSegment,
} from "./cat-editor-comments-section.fixture";

type CommentsStoryHostProps = {
  initialSegment: CatSegment;
  isLoading?: boolean;
  canAddComment?: boolean;
  supportsIssueComments?: boolean;
  isPostingComment?: boolean;
  isResolvingComment?: boolean;
  resolvingCommentId?: string | null;
  commentPostError?: string;
  simulatePostDelayMs?: number;
  onOpenIssueSheet?: () => void;
};

function CommentsStoryHost({
  initialSegment,
  isLoading = false,
  canAddComment = true,
  supportsIssueComments = true,
  isPostingComment: forcedPosting,
  isResolvingComment: forcedResolving,
  resolvingCommentId: forcedResolvingId,
  commentPostError,
  simulatePostDelayMs = 0,
  onOpenIssueSheet,
}: CommentsStoryHostProps) {
  const [segment, setSegment] = useState(initialSegment);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isResolvingComment, setIsResolvingComment] = useState(false);
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null);

  async function handleAddComment(input: CatSegmentCommentInput) {
    setIsPostingComment(true);
    if (simulatePostDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatePostDelayMs));
    }

    const nextComment: CatSegmentComment = {
      id: `local-${crypto.randomUUID()}`,
      type: input.type ?? "comment",
      status: input.type === "issue" ? "unresolved" : null,
      text: input.text,
      createdAt: new Date().toISOString(),
      locale: segment.targetLocale,
      author: "You",
    };

    setSegment((current) => ({
      ...current,
      comments: [...(current.comments ?? []), nextComment],
    }));
    setIsPostingComment(false);
  }

  async function handleResolveComment(commentId: string) {
    setIsResolvingComment(true);
    setResolvingCommentId(commentId);
    if (simulatePostDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatePostDelayMs));
    }

    setSegment((current) => ({
      ...current,
      comments: (current.comments ?? []).map((comment) =>
        comment.id === commentId ? { ...comment, status: "resolved" } : comment,
      ),
    }));
    setIsResolvingComment(false);
    setResolvingCommentId(null);
  }

  return (
    <div className="mx-auto flex min-h-[28rem] max-w-xl items-start bg-background p-8 text-foreground">
      <div className="w-full rounded-xl border border-border bg-card px-5 pb-5">
        <CatEditorCommentsSection
          segment={segment}
          isLoading={isLoading}
          canAddComment={canAddComment}
          supportsIssueComments={supportsIssueComments}
          isPostingComment={forcedPosting ?? isPostingComment}
          isResolvingComment={forcedResolving ?? isResolvingComment}
          resolvingCommentId={
            forcedResolvingId !== undefined ? forcedResolvingId : resolvingCommentId
          }
          commentPostError={commentPostError}
          onAddComment={handleAddComment}
          onOpenIssueSheet={onOpenIssueSheet}
          onResolveComment={handleResolveComment}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "CAT/Editor Comments Section",
  component: CommentsStoryHost,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    initialSegment: createCatEditorCommentsSegment(),
    isLoading: false,
    canAddComment: true,
    // Crowdin keeps Comment/Issue tabs; native uses CatEditorIssuesSection instead.
    supportsIssueComments: true,
  },
} satisfies Meta<typeof CommentsStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyRaiseIssue: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({ comments: [] }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Comments")).toBeInTheDocument();
    await expect(
      canvas.getByText("No comments yet. Add a note for reviewers or translators."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Issue" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "Issue" }));
    await waitFor(() => expect(canvas.getByText("Issue type")).toBeInTheDocument());
    await expect(canvas.getByText("General question")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Raise issue" })).toBeDisabled();
  },
};

export const WithCommentsAndIssues: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({
      comments: catEditorCommentsFixture,
    }),
    onOpenIssueSheet: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("3")).toBeInTheDocument();
    await expect(
      canvas.getByText("Keep the tone closer to product marketing copy."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Is “Social:” meant as a section label or a form field?"),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
    await expect(canvas.getAllByText("Issue")).toHaveLength(3);

    const issueSheetButton = canvas.getByRole("button", { name: "Issues" });
    await expect(issueSheetButton).toBeInTheDocument();
    await userEvent.click(issueSheetButton);
    await expect(args.onOpenIssueSheet).toHaveBeenCalledTimes(1);
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    initialSegment: createCatEditorCommentsSegment({
      comments: catEditorCommentsFixture,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Comments")).toBeInTheDocument();
    await expect(canvas.getByRole("list")).toHaveAttribute("aria-busy", "true");
  },
};

export const PostingIssue: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({ comments: [] }),
    isPostingComment: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Issue" }));
    await expect(canvas.getByRole("button", { name: /Posting/ })).toBeDisabled();
    await expect(canvas.getByPlaceholderText("Add a comment...")).toBeDisabled();
  },
};

export const CommentOnly: Story = {
  args: {
    supportsIssueComments: false,
    initialSegment: createCatEditorCommentsSegment({
      comments: [catEditorCommentsFixture[0]!],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab", { name: "Issue" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add comment" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Issues" })).not.toBeInTheDocument();
  },
};

export const IssueSheetCtaWithExistingIssues: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({
      comments: catEditorCommentsFixture,
    }),
    onOpenIssueSheet: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const issueSheetButton = canvas.getByRole("button", { name: "Issues" });

    await expect(issueSheetButton).toBeInTheDocument();
    await expect(issueSheetButton).toBeEnabled();

    await userEvent.click(issueSheetButton);
    await expect(args.onOpenIssueSheet).toHaveBeenCalledTimes(1);
  },
};

export const IssueSheetCtaOnIssueTab: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({ comments: [] }),
    onOpenIssueSheet: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole("button", { name: "Issues" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "Issue" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Issues" })).toBeInTheDocument());

    await userEvent.click(canvas.getByRole("button", { name: "Issues" }));
    await expect(args.onOpenIssueSheet).toHaveBeenCalledTimes(1);
  },
};

export const IssueSheetCtaHiddenOnCommentTab: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({
      comments: [catEditorCommentsFixture[0]!],
    }),
    onOpenIssueSheet: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("tab", { name: "Comment" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(canvas.queryByRole("button", { name: "Issues" })).not.toBeInTheDocument();
  },
};

export const IssueSheetCtaDisabledWhilePosting: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({
      comments: catEditorCommentsFixture,
    }),
    isPostingComment: true,
    onOpenIssueSheet: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("button", { name: "Issues" })).toBeDisabled();
  },
};

export const RaiseIssueInteraction: Story = {
  args: {
    initialSegment: createCatEditorCommentsSegment({ comments: [] }),
    onOpenIssueSheet: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("tab", { name: "Issue" }));
    await waitFor(() => expect(canvas.getByText("Issue type")).toBeInTheDocument());
    await expect(canvas.getByText("General question")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Issues" })).toBeInTheDocument();

    const input = canvas.getByPlaceholderText("Add a comment...");
    await userEvent.type(input, "Wrong tone for ja-JP.");
    await expect(canvas.getByRole("button", { name: "Raise issue" })).toBeEnabled();

    await userEvent.click(canvas.getByRole("button", { name: "Raise issue" }));
    await waitFor(() => expect(canvas.getByText("Wrong tone for ja-JP.")).toBeInTheDocument());
    await expect(canvas.getByText("1")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Resolve" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Issues" }));
    await expect(args.onOpenIssueSheet).toHaveBeenCalledTimes(1);
  },
};
