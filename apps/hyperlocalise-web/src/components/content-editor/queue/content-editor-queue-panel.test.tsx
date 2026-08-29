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
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { contentEditorSegmentsFixture } from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorQueuePanel } from "./content-editor-queue-panel";

describe("ContentEditorQueuePanel pagination", () => {
  it("offers a manual load-more fallback when more queue pages exist", async () => {
    const user = userEvent.setup();
    const onLoadMoreQueue = vi.fn();
    const segments = contentEditorSegmentsFixture.slice(0, 3);

    renderWithContentEditorProviders(
      <ContentEditorQueuePanel
        segments={segments}
        selectedSegmentId={segments[0]!.id}
        onSelectSegment={vi.fn()}
        pagination={{
          offset: 0,
          limit: 3,
          returnedCount: 3,
          totalCount: 9,
          hasMore: true,
        }}
        hasMoreQueue
        onLoadMoreQueue={onLoadMoreQueue}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMoreQueue).toHaveBeenCalledTimes(1);
  });
});

describe("ContentEditorQueuePanel chrome", () => {
  it("does not render filter, search, or bulk actions in the queue column", () => {
    const segments = contentEditorSegmentsFixture.slice(0, 3);

    renderWithContentEditorProviders(
      <ContentEditorQueuePanel
        segments={segments}
        selectedSegmentId={segments[0]!.id}
        onSelectSegment={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Filter queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Queue actions" })).not.toBeInTheDocument();
  });
});
