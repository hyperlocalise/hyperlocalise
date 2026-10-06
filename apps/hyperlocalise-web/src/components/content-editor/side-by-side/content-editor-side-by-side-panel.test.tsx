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

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  contentEditorSegmentsFixture,
  createContentEditorWorkspaceState,
} from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorWorkspaceProvider } from "@/components/content-editor/workspace/content-editor-workspace-context";

import { ContentEditorSideBySidePanel } from "./content-editor-side-by-side-panel";

// Mock @tanstack/react-virtual
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        start: index * 72,
        end: (index + 1) * 72,
        size: 72,
        key: index,
        lane: 0,
      })),
    getTotalSize: () => options.count * 72,
    scrollToIndex: vi.fn(),
    measureElement: () => undefined,
    scrollOffset: 0,
    scrollRect: { height: 600 },
    getScrollElement: () => null,
  }),
}));

function renderSideBySidePanel(
  overrides: Partial<Parameters<typeof ContentEditorSideBySidePanel>[0]> = {},
) {
  const state = createContentEditorWorkspaceState({ selectedSegmentId: "seg-01" });
  const segments = contentEditorSegmentsFixture.slice(0, 3);

  const defaultProps: Parameters<typeof ContentEditorSideBySidePanel>[0] = {
    segments,
    focusedSegmentId: "seg-01",
    intelligenceSegment: segments[0] ?? null,
    intelligence: null,
    dirtySegmentIds: new Set(),
    loadingSegmentIds: new Set(),
    canEditTranslations: true,
    canAddComment: false,
    supportsIssueComments: false,
    isCommentsLoading: false,
    isPostingComment: false,
    isResolvingComment: false,
    resolvingCommentId: null,
    commentPostError: undefined,
    isLookingUpContext: false,
    isConcordanceLoading: false,
    isVisualContextLoading: false,
    showAgentContext: false,
    showVisualContext: false,
    canLookupFreshContext: false,
    onFocusSegment: vi.fn(),
    onTargetChange: vi.fn(),
    ...overrides,
  };

  return {
    ...renderWithContentEditorProviders(
      <ContentEditorWorkspaceProvider initialState={state}>
        <ContentEditorSideBySidePanel {...defaultProps} />
      </ContentEditorWorkspaceProvider>,
    ),
  };
}

describe("ContentEditorSideBySidePanel", () => {
  it("renders standard pagination summary when reviewerLayout is false", () => {
    renderSideBySidePanel({ reviewerLayout: false });
    expect(screen.getByText(/3 loaded/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reviewer-status-bar")).not.toBeInTheDocument();
  });

  it("renders reviewer status bar and bulkBar when reviewerLayout is true", () => {
    renderSideBySidePanel({
      reviewerLayout: true,
      bulkBar: <div data-testid="mock-bulk-bar">Bulk Bar Content</div>,
      showSelection: true,
      checkedSegmentIds: new Set(["seg-01"]),
      onToggleSegmentChecked: vi.fn(),
    });

    expect(screen.getByTestId("mock-bulk-bar")).toBeInTheDocument();
    expect(screen.getByTestId("reviewer-status-bar")).toBeInTheDocument();
    expect(screen.getByText(/3 strings/i)).toBeInTheDocument();
  });
});
