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

import { screen, waitFor } from "@testing-library/react";
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

  it("shows QA details in the sidebar", () => {
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

    expect(screen.getByText(/Format & QA checks/i)).toBeInTheDocument();
    expect(screen.getByText("Spelling")).toBeInTheDocument();
  });

  it("scrolls the QA section when the workspace UI store reveals details", async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

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

    expect(scrollIntoView).not.toHaveBeenCalled();

    workspace.ui.revealQaDetails();

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });
});
