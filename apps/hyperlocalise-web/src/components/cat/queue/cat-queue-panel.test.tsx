// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { catSegmentsFixture } from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatQueuePanel } from "./cat-queue-panel";

describe("CatQueuePanel pagination", () => {
  it("offers a manual load-more fallback when more queue pages exist", async () => {
    const user = userEvent.setup();
    const onLoadMoreQueue = vi.fn();
    const segments = catSegmentsFixture.slice(0, 3);

    renderWithCatProviders(
      <CatQueuePanel
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
