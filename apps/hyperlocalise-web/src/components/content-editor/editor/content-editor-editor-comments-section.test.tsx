// @vitest-environment happy-dom

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
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import type { ContentEditorSegmentCommentInput } from "@/components/content-editor/shared/types";

import { ContentEditorEditorCommentsSection } from "./content-editor-editor-comments-section";
import {
  contentEditorEditorCommentsFixture,
  createCatEditorCommentsSegment,
} from "./content-editor-editor-comments-section.fixture";

function renderCommentsSection(
  overrides: Partial<Parameters<typeof ContentEditorEditorCommentsSection>[0]> = {},
) {
  const segment = createCatEditorCommentsSegment({
    comments: [],
    ...overrides.segment,
  });

  const props = {
    segment,
    isLoading: false,
    canAddComment: true,
    supportsIssueComments: true,
    isPostingComment: false,
    isResolvingComment: false,
    resolvingCommentId: null,
    onAddComment: vi.fn(),
    onResolveComment: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...renderWithContentEditorProviders(<ContentEditorEditorCommentsSection {...props} />),
  };
}

describe("ContentEditorEditorCommentsSection", () => {
  it("shows the Issue Sheet CTA when the segment has issue comments", () => {
    renderCommentsSection({
      segment: createCatEditorCommentsSegment({
        comments: contentEditorEditorCommentsFixture,
      }),
      onOpenIssueSheet: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Board" })).toBeInTheDocument();
  });

  it("shows the Issue Sheet CTA when the Issue tab is selected", async () => {
    const user = userEvent.setup();

    renderCommentsSection({
      onOpenIssueSheet: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Board" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Issue" }));

    expect(screen.getByRole("button", { name: "Board" })).toBeInTheDocument();
  });

  it("hides the Issue Sheet CTA on the Comment tab when there are no issue comments", () => {
    renderCommentsSection({
      segment: createCatEditorCommentsSegment({
        comments: [contentEditorEditorCommentsFixture[0]!],
      }),
      onOpenIssueSheet: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Board" })).not.toBeInTheDocument();
  });

  it("hides the Issue Sheet CTA when no handler is provided", () => {
    renderCommentsSection({
      segment: createCatEditorCommentsSegment({
        comments: contentEditorEditorCommentsFixture,
      }),
    });

    expect(screen.queryByRole("button", { name: "Board" })).not.toBeInTheDocument();
  });

  it("hides the Issue Sheet CTA when issue comments are unsupported", () => {
    renderCommentsSection({
      supportsIssueComments: false,
      segment: createCatEditorCommentsSegment({
        comments: contentEditorEditorCommentsFixture,
      }),
      onOpenIssueSheet: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: "Board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Issue" })).not.toBeInTheDocument();
  });

  it("invokes onOpenIssueSheet when the Issues button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenIssueSheet = vi.fn();

    renderCommentsSection({
      segment: createCatEditorCommentsSegment({
        comments: contentEditorEditorCommentsFixture,
      }),
      onOpenIssueSheet,
    });

    await user.click(screen.getByRole("button", { name: "Board" }));

    expect(onOpenIssueSheet).toHaveBeenCalledTimes(1);
  });

  it("disables the Issue Sheet CTA while posting a comment", () => {
    renderCommentsSection({
      segment: createCatEditorCommentsSegment({
        comments: contentEditorEditorCommentsFixture,
      }),
      isPostingComment: true,
      onOpenIssueSheet: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Board" })).toBeDisabled();
  });

  it("disables the Issue Sheet CTA while resolving an issue", () => {
    renderCommentsSection({
      segment: createCatEditorCommentsSegment({
        comments: contentEditorEditorCommentsFixture,
      }),
      isResolvingComment: true,
      resolvingCommentId: "issue-open-1",
      onOpenIssueSheet: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Board" })).toBeDisabled();
  });

  it("posts a plain comment without issue metadata on the Comment tab", async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn<(input: ContentEditorSegmentCommentInput) => void>();

    renderCommentsSection({ onAddComment });

    await user.type(screen.getByPlaceholderText("Add a comment..."), "Needs another review pass.");
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(onAddComment).toHaveBeenCalledWith({
      text: "Needs another review pass.",
    });
  });

  it("posts an issue with issue metadata on the Issue tab", async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn<(input: ContentEditorSegmentCommentInput) => void>();

    renderCommentsSection({ onAddComment });

    await user.click(screen.getByRole("tab", { name: "Issue" }));
    await user.type(screen.getByPlaceholderText("Add a comment..."), "Source label is ambiguous.");
    await user.click(screen.getByRole("button", { name: "Raise issue" }));

    expect(onAddComment).toHaveBeenCalledWith({
      text: "Source label is ambiguous.",
      type: "issue",
      issueType: "general_question",
    });
  });
});
