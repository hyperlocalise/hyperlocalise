// @vitest-environment happy-dom

import type { ReactElement } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  catSegmentsFixture,
  createCatWorkspaceState,
  mockValidateFormat,
} from "@/components/cat/shared/cat.fixture";
import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import { CatWorkspaceContainer } from "./cat-workspace-container";

const ROW_HEIGHT = 88;

type MockVirtualizer = {
  getVirtualItems: () => Array<{
    index: number;
    start: number;
    end: number;
    size: number;
    key: number;
    lane: number;
  }>;
  getTotalSize: () => number;
  measureElement: () => undefined;
};

const virtualizerByCount = new Map<number, MockVirtualizer>();

beforeEach(() => {
  virtualizerByCount.clear();
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number; estimateSize?: () => number }) => {
    const rowHeight = options.estimateSize?.() ?? ROW_HEIGHT;
    const count = options.count ?? 0;

    const cached = virtualizerByCount.get(count);
    if (cached) {
      return cached;
    }

    const virtualItems = Array.from({ length: count }, (_, index) => ({
      index,
      start: index * rowHeight,
      end: (index + 1) * rowHeight,
      size: rowHeight,
      key: index,
      lane: 0,
    }));

    const virtualizer: MockVirtualizer = {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => count * rowHeight,
      measureElement: () => undefined,
    };

    virtualizerByCount.set(count, virtualizer);
    return virtualizer;
  },
}));

async function waitForTargetEditor() {
  return waitFor(() =>
    document.querySelector('[aria-label="Target translation"][contenteditable="true"]'),
  );
}

function createUiCatWorkspaceState() {
  return createCatWorkspaceState({
    selectedSegmentId: "seg-02",
    segments: catSegmentsFixture.filter((segment) =>
      ["seg-01", "seg-02", "seg-03"].includes(segment.id),
    ),
  });
}

function renderCatWorkspace(ui: ReactElement) {
  return renderWithCatProviders(
    <div style={{ height: "900px", width: "1280px" }} className="bg-background text-foreground">
      {ui}
    </div>,
  );
}

function getQueueSegmentButton(sourceText: string) {
  const queueButton = screen
    .getAllByText(sourceText)
    .map((element) => element.closest("button"))
    .find((button) => button !== null);
  expect(queueButton).toBeTruthy();
  return queueButton as HTMLButtonElement;
}

describe("CatWorkspaceContainer queue navigation", () => {
  it("selects another segment from the queue", async () => {
    const user = userEvent.setup();
    const onSelectSegment = vi.fn();

    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        navigation={{ onSelectSegment }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    await user.click(getQueueSegmentButton("Reviews awaiting approval"));

    expect(onSelectSegment).toHaveBeenCalledWith("seg-01");
  });

  it("removes filtered-out queue rows when the server snapshot refreshes", async () => {
    const initialState = createUiCatWorkspaceState();
    const filteredState = createCatWorkspaceState({
      selectedSegmentId: "seg-01",
      queueSegments: [
        {
          id: "seg-01",
          index: 1,
          key: "reviews.awaitingApproval",
          sourceText: "Reviews awaiting approval",
        },
      ],
    });
    const view = renderCatWorkspace(<CatWorkspaceContainer initialState={initialState} />);

    expect(
      getQueueSegmentButton("Dashboard card showing how many reviews still need approval."),
    ).toBeInTheDocument();

    view.rerender(
      <div style={{ height: "900px", width: "1280px" }} className="bg-background text-foreground">
        <CatWorkspaceContainer initialState={initialState} queueSnapshot={filteredState} />
      </div>,
    );

    await waitFor(() => {
      expect(
        screen.queryAllByText("Dashboard card showing how many reviews still need approval."),
      ).toHaveLength(0);
    });
    expect(getQueueSegmentButton("Reviews awaiting approval")).toBeInTheDocument();
  });

  it("shows the unsaved navigation dialog when leaving a dirty segment", async () => {
    const user = userEvent.setup();
    const onSelectSegment = vi.fn();

    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        navigation={{ onSelectSegment }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    const targetEditor = (await waitForTargetEditor()) as HTMLElement;
    await user.click(targetEditor);
    await user.keyboard(" unsaved");

    await user.click(getQueueSegmentButton("Reviews awaiting approval"));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Leave segment with unsaved changes?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Leave without saving" }));

    expect(onSelectSegment).toHaveBeenCalledWith("seg-01");
  });

  it("stays on the current segment when cancelling unsaved navigation", async () => {
    const user = userEvent.setup();
    const onSelectSegment = vi.fn();

    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        navigation={{ onSelectSegment }}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    const targetEditor = (await waitForTargetEditor()) as HTMLElement;
    await user.click(targetEditor);
    await user.keyboard(" unsaved");

    await user.click(getQueueSegmentButton("Reviews awaiting approval"));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Stay" }));

    expect(onSelectSegment).not.toHaveBeenCalled();
    await waitFor(() => {
      const targetEditor = document.querySelector(
        '[aria-label="Target translation"][contenteditable="true"]',
      );
      expect(targetEditor?.textContent).toContain(" unsaved");
    });
  });

  it("prompts before a local queue filter hides the dirty segment", async () => {
    const user = userEvent.setup();

    renderCatWorkspace(
      <CatWorkspaceContainer
        initialState={createUiCatWorkspaceState()}
        services={{ validateFormat: mockValidateFormat }}
      />,
    );

    const targetEditor = (await waitForTargetEditor()) as HTMLElement;
    await user.click(targetEditor);
    await user.keyboard(" unsaved");
    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Approved" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Leave segment with unsaved changes?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Stay" }));

    expect(screen.getByRole("button", { name: "Filter queue" })).toHaveTextContent("All strings");
    await waitFor(() => {
      const targetEditor = document.querySelector(
        '[aria-label="Target translation"][contenteditable="true"]',
      );
      expect(targetEditor?.textContent).toContain(" unsaved");
    });
  });
});
