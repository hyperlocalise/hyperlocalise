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
import { describe, expect, it } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorReviewerStatusBar } from "./content-editor-reviewer-status-bar";

describe("ContentEditorReviewerStatusBar", () => {
  it("renders status tally with loaded count and category counts", () => {
    renderWithContentEditorProviders(
      <ContentEditorReviewerStatusBar
        summary={{
          total: 10,
          reviewed: 4,
          needsReview: 3,
          pending: 2,
          skipped: 1,
          withIssues: 2,
        }}
        hasMore={true}
      />,
    );

    expect(screen.getByText("10+ strings")).toBeInTheDocument();
    expect(screen.getByText("4 reviewed")).toBeInTheDocument();
    expect(screen.getByText("3 needs review")).toBeInTheDocument();
    expect(screen.getByText("2 untranslated")).toBeInTheDocument();
    expect(screen.getByText("2 with issues")).toBeInTheDocument();
  });

  it("omits with issues section when withIssues is 0", () => {
    renderWithContentEditorProviders(
      <ContentEditorReviewerStatusBar
        summary={{
          total: 5,
          reviewed: 5,
          needsReview: 0,
          pending: 0,
          skipped: 0,
          withIssues: 0,
        }}
        hasMore={false}
      />,
    );

    expect(screen.getByText("5 strings")).toBeInTheDocument();
    expect(screen.getByText("5 reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/with issues/)).not.toBeInTheDocument();
  });
});
