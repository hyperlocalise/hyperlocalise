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

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorQueueToolbarHost } from "@/components/content-editor/queue/content-editor-queue-toolbar-host";
import {
  contentEditorSegmentsFixture,
  createContentEditorWorkspaceState,
  mockValidateFormat,
} from "@/components/content-editor/shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorWorkspaceContainer } from "./content-editor-workspace-container";

// The multilingual table loads each cell's translation through this hook.
vi.mock("@/components/content-editor/project-file/use-content-editor-segment-target", () => ({
  useContentEditorSegmentTarget: () => ({
    data: { text: "", isApproved: false },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// Give the virtualized lists a viewport so their rows render.
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) =>
      actual.useVirtualizer({
        ...options,
        observeElementRect: (_instance, callback) => {
          callback({ width: 1280, height: 900 });
          return () => {};
        },
      }),
  };
});

const SEGMENT_KEYS = contentEditorSegmentsFixture
  .filter((segment) => ["seg-01", "seg-02", "seg-03"].includes(segment.id))
  .map((segment) => segment.key);

function renderWorkspace(
  props: Partial<Parameters<typeof ContentEditorWorkspaceContainer>[0]> = {},
) {
  return renderWithContentEditorProviders(
    <div style={{ height: "900px", width: "1280px" }}>
      <ContentEditorQueueToolbarHost />
      <ContentEditorWorkspaceContainer
        initialState={createContentEditorWorkspaceState({
          selectedSegmentId: "seg-02",
          segments: contentEditorSegmentsFixture.filter((segment) =>
            ["seg-01", "seg-02", "seg-03"].includes(segment.id),
          ),
        })}
        multilingual={{
          organizationSlug: "org",
          projectId: "proj",
          sourcePath: "app.json",
          sourceLocale: "en",
          targetLocales: ["vi", "ja"],
        }}
        services={{ validateFormat: mockValidateFormat }}
        {...props}
      />
    </div>,
  );
}

describe("ContentEditorWorkspaceContainer selection", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("content-editor-queue:selection-mode:v1", "true");
  });

  it.each(["comfortable", "side-by-side", "multilingual"] as const)(
    "ticks strings one by one and with Select all visible in the %s layout",
    async (viewMode) => {
      const user = userEvent.setup();
      renderWorkspace({ initialViewMode: viewMode, review: { onBulkLock: vi.fn() } });

      const firstBox = await screen.findByRole("checkbox", { name: `Select ${SEGMENT_KEYS[0]}` });
      await user.click(firstBox);
      expect(firstBox).toBeChecked();

      const bar = screen.getByRole("toolbar", { name: /bulk/i });
      expect(within(bar).getByText("1 selected")).toBeInTheDocument();
      await user.click(within(bar).getByRole("button", { name: /Select all visible/ }));

      for (const key of SEGMENT_KEYS) {
        expect(screen.getByRole("checkbox", { name: `Select ${key}` })).toBeChecked();
      }
      expect(within(bar).getByText("3 selected")).toBeInTheDocument();
    },
  );

  it("does not approve with Ctrl+Enter in Comfortable while a ticked string's box has focus", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue("reviewed");
    renderWorkspace({ initialViewMode: "comfortable", review: { onApprove } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Approve/i })).not.toBeDisabled(),
    );
    await user.click(await screen.findByRole("checkbox", { name: `Select ${SEGMENT_KEYS[2]}` }));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(onApprove).not.toHaveBeenCalled();
  });
});
