// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  catIntelligenceFixture,
  createCatWorkspaceState,
} from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatSideBySideIntelligencePanel } from "./cat-side-by-side-intelligence-panel";

function renderIntelligencePanel(
  overrides: Partial<Parameters<typeof CatSideBySideIntelligencePanel>[0]> = {},
) {
  const state = createCatWorkspaceState({ selectedSegmentId: "seg-02" });
  const segment = state.segments!.find((item) => item.id === "seg-02")!;

  const props = {
    segment,
    intelligence: catIntelligenceFixture,
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
    ...renderWithCatProviders(<CatSideBySideIntelligencePanel {...props} />),
  };
}

describe("CatSideBySideIntelligencePanel", () => {
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

  it("hides find context when onAskQuestion is not provided", () => {
    renderIntelligencePanel({ onAskQuestion: undefined });

    expect(screen.queryByRole("button", { name: /Find context/i })).not.toBeInTheDocument();
  });
});
