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

import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  contentEditorIntelligenceFixture,
  createContentEditorWorkspaceState,
} from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorWorkspaceContext } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { createCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-orchestrator";

import { ContentEditorSideBySideIntelligencePanel } from "./content-editor-side-by-side-intelligence-panel";

function renderIntelligencePanel(
  overrides: Partial<Parameters<typeof ContentEditorSideBySideIntelligencePanel>[0]> = {},
) {
  const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-02" });
  const workspace = createCatWorkspace(state);
  const segment = state.segments!.find((item) => item.id === "seg-02")!;

  const props = {
    segment,
    intelligence: contentEditorIntelligenceFixture,
    isLookingUpContext: false,
    isConcordanceLoading: false,
    isVisualContextLoading: false,
    showAgentContext: false,
    showVisualContext: false,
    canEditTranslations: true,
    canLookupFreshContext: true,
    canAddComment: false,
    supportsIssueComments: false,
    isCommentsLoading: false,
    isPostingComment: false,
    isResolvingComment: false,
    resolvingCommentId: null,
    onAskQuestion: vi.fn(),
    placement: "right" as const,
    ...overrides,
  };

  return {
    props,
    workspace,
    ...renderWithContentEditorProviders(
      <ContentEditorWorkspaceContext.Provider value={workspace}>
        <ContentEditorSideBySideIntelligencePanel {...props} />
      </ContentEditorWorkspaceContext.Provider>,
    ),
  };
}

describe("ContentEditorSideBySideIntelligencePanel", () => {
  it("renders find context and invokes onAskQuestion", async () => {
    const user = userEvent.setup();
    const onAskQuestion = vi.fn();

    renderIntelligencePanel({ onAskQuestion });

    await user.click(screen.getByRole("button", { name: /Find context/i }));
    expect(onAskQuestion).toHaveBeenCalledTimes(1);
  });

  it("disables find context when lookup is unavailable", () => {
    renderIntelligencePanel({ canLookupFreshContext: false });

    expect(screen.getByRole("button", { name: /Find context/i })).toBeDisabled();
  });

  it("shows finding state while looking up context", () => {
    renderIntelligencePanel({ isLookingUpContext: true });

    expect(screen.getByRole("button", { name: /Finding context/i })).toBeDisabled();
  });

  it.each([
    { isApproving: true },
    { isSavingDraft: true },
    { isAiSuggestionLoading: true },
    { isFormatChecksLoading: true },
  ] as const)("disables find context during busy state %j", (busyState) => {
    renderIntelligencePanel(busyState);

    expect(screen.getByRole("button", { name: /Find context/i })).toBeDisabled();
  });

  it("hides find context when onAskQuestion is not provided", () => {
    renderIntelligencePanel({ onAskQuestion: undefined });

    expect(screen.queryByRole("button", { name: /Find context/i })).not.toBeInTheDocument();
  });

  it("puts translation memory before character limit and shows a pencil", () => {
    renderIntelligencePanel({
      showMaxLengthEditor: true,
      onSetMaxLength: vi.fn(),
    });

    const tmHeading = screen.getByRole("heading", { name: "Translation memory" });
    const limitHeading = screen.getByRole("heading", { name: "Character limit" });
    expect(tmHeading.compareDocumentPosition(limitHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole("button", { name: "Set character limit" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Character limit" })).not.toBeInTheDocument();
  });

  it("collapses translation memory to two matches behind a show more button", async () => {
    const user = userEvent.setup();
    const onUseTmMatch = vi.fn();

    renderIntelligencePanel({ onUseTmMatch });

    expect(screen.getAllByRole("button", { name: "Use" })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Show 1 more match/i }));

    expect(screen.getAllByRole("button", { name: "Use" })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /Show fewer matches/i }));

    expect(screen.getAllByRole("button", { name: "Use" })).toHaveLength(2);
  });

  it("lets reviewers set a character limit", async () => {
    const user = userEvent.setup();
    const onSetMaxLength = vi.fn().mockResolvedValue(undefined);

    renderIntelligencePanel({
      showMaxLengthEditor: true,
      onSetMaxLength,
    });

    await user.click(screen.getByRole("button", { name: "Set character limit" }));
    const input = screen.getByRole("spinbutton", { name: "Character limit" });
    await user.clear(input);
    await user.type(input, "32");
    await user.tab();

    await waitFor(() => {
      expect(onSetMaxLength).toHaveBeenCalledWith(32);
    });
  });

  it("shows translation intelligence on the details tab", () => {
    renderIntelligencePanel();

    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Translation Intelligence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Find context/i })).toBeInTheDocument();
    expect(screen.queryByText("Source text")).not.toBeInTheDocument();
  });

  it("shows a comment count on the Comments tab", () => {
    const segment = createContentEditorWorkspaceState({
      selectedSegmentId: "seg-02",
    }).segments!.find((item) => item.id === "seg-02")!;

    renderIntelligencePanel({
      segment: {
        ...segment,
        comments: [
          {
            id: "comment-1",
            type: "comment",
            status: null,
            text: "Keep this card short on mobile.",
            createdAt: "2026-06-10T09:15:00.000Z",
            locale: "vi",
            author: "Alex Reviewer",
          },
          {
            id: "comment-2",
            type: "comment",
            status: null,
            text: "“Review” means approval, not a rating.",
            createdAt: "2026-06-11T14:30:00.000Z",
            locale: "vi",
            author: "Mina Translator",
          },
        ],
      },
    });

    expect(screen.getByRole("tab", { name: /Comments/i })).toHaveTextContent("2");
  });

  it("shows QA details on the QA checks tab with an issue count", async () => {
    const user = userEvent.setup();
    renderIntelligencePanel({
      formatChecks: [
        {
          id: "spelling",
          label: "Spelling",
          status: "warn",
          message: '"Drive" may be misspelled.',
          category: "spelling",
          relatedTokens: ["Drive"],
        },
      ],
    });

    const qaTab = screen.getByRole("tab", { name: /QA checks/i });
    expect(qaTab).toHaveTextContent("1");
    expect(screen.queryByText("Spelling")).not.toBeInTheDocument();

    await user.click(qaTab);

    expect(screen.getByText(/Format & QA checks/i)).toBeInTheDocument();
    expect(screen.getByText("Spelling")).toBeInTheDocument();
  });

  it("keeps the comments composer in its own scrollable tab", async () => {
    const user = userEvent.setup();
    renderIntelligencePanel({ canAddComment: true });

    await user.click(screen.getByRole("tab", { name: /Comments/i }));

    const commentsSection = document.querySelector("[data-inspector-comments]");
    expect(commentsSection).toHaveClass("overflow-y-auto");
  });

  it("keeps a long QA list scrollable inside the sidebar", async () => {
    const user = userEvent.setup();
    renderIntelligencePanel({
      formatChecks: Array.from({ length: 12 }, (_, index) => ({
        id: `qa-check-${index}`,
        label: `Check ${index + 1}`,
        status: "fail" as const,
        message: `Finding ${index + 1}`,
        category: "qa" as const,
      })),
    });

    await user.click(screen.getByRole("tab", { name: /QA checks/i }));

    const qaSection = document.querySelector("[data-qa-details]");
    expect(qaSection).toHaveClass("overflow-y-auto");
    expect(screen.getByText("Check 1")).toBeInTheDocument();
    expect(screen.getByText("Check 12")).toBeInTheDocument();
  });

  it("switches to the QA checks tab when the workspace UI store reveals details", async () => {
    const { workspace } = renderIntelligencePanel({
      formatChecks: [
        {
          id: "spelling",
          label: "Spelling",
          status: "warn",
          message: '"Drive" may be misspelled.',
          category: "spelling",
          relatedTokens: ["Drive"],
        },
      ],
    });

    expect(screen.queryByText("Spelling")).not.toBeInTheDocument();

    act(() => workspace.ui.revealQaDetails());

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /QA checks/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(screen.getByText("Spelling")).toBeInTheDocument();
  });
});
