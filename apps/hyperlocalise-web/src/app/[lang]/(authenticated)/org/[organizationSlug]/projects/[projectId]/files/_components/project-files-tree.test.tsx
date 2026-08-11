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

import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { createProjectFileRecord } from "./project-files.fixture";
import { ProjectFilesTree } from "./project-files-tree";

async function openOptionsMenu(container: HTMLElement) {
  const host = container.querySelector("file-tree-container");
  expect(host).toBeTruthy();

  const row = host?.shadowRoot?.querySelector(
    '[data-item-path="marketing/pricing.json"]',
  ) as HTMLElement | null;
  expect(row).toBeTruthy();
  await userEvent.hover(row!);

  const trigger = host?.shadowRoot?.querySelector('[aria-label="Options"]') as HTMLElement | null;
  expect(trigger).toBeTruthy();
  await userEvent.click(trigger!);
}

/**
 * Recreate the production failure mode: parent re-renders with a new `files`
 * array identity (and opens a modal) after Translate with agent. Pierre's host
 * effect used to drop React `renderContextMenu` wiring; the "..." trigger then
 * stayed expanded with no menu content.
 */
function FilesPageWithChurningFiles() {
  const [translateOpen, setTranslateOpen] = useState(false);
  const [renderCount, setRenderCount] = useState(0);

  const file = createProjectFileRecord({
    sourcePath: "marketing/pricing.json",
    storedFileId: "file_pricing",
    provider: null,
  });

  return (
    <>
      <div style={{ width: 640, height: 480 }}>
        <ProjectFilesTree
          files={[file]}
          selectedSourcePath={file.sourcePath}
          onSelectFile={vi.fn()}
          fileActions={{
            organizationSlug: "acme",
            projectId: "proj_1",
            highlightLocale: null,
            projectTargetLocales: ["fr"],
            sourceLocale: "en",
            onViewStrings: vi.fn(),
            onTranslateFile: () => {
              setRenderCount((count) => count + 1);
              setTranslateOpen(true);
            },
            onImportFile: vi.fn(),
            onDownloadFile: vi.fn(),
          }}
        />
      </div>
      <p data-testid="render-count">{renderCount}</p>
      <Dialog open={translateOpen} onOpenChange={setTranslateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Translate with agent</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setTranslateOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("ProjectFilesTree context menu", () => {
  it("shows Translate with agent in the row Options menu", async () => {
    const file = createProjectFileRecord({
      sourcePath: "marketing/pricing.json",
      storedFileId: "file_pricing",
      provider: null,
    });

    const { container } = render(
      <IntlProvider locale="en" messages={{}}>
        <div style={{ width: 640, height: 480 }}>
          <ProjectFilesTree
            files={[file]}
            selectedSourcePath={file.sourcePath}
            onSelectFile={vi.fn()}
            fileActions={{
              organizationSlug: "acme",
              projectId: "proj_1",
              highlightLocale: null,
              projectTargetLocales: ["fr"],
              sourceLocale: "en",
              onViewStrings: vi.fn(),
              onTranslateFile: vi.fn(),
              onImportFile: vi.fn(),
              onDownloadFile: vi.fn(),
            }}
          />
        </div>
      </IntlProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector("file-tree-container")).toBeTruthy();
    });

    await openOptionsMenu(container);

    await waitFor(() => {
      const menu = document.querySelector('[data-file-tree-context-menu-root="true"]');
      expect(menu).toBeTruthy();
      expect(menu?.textContent).toContain("Translate with agent");
    });
  });

  it("keeps Options menu content after translate dialog open/close with files churn", async () => {
    const { container } = render(
      <IntlProvider locale="en" messages={{}}>
        <FilesPageWithChurningFiles />
      </IntlProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector("file-tree-container")).toBeTruthy();
    });

    await openOptionsMenu(container);
    const firstMenu = await waitFor(() => {
      const menu = document.querySelector('[data-file-tree-context-menu-root="true"]');
      expect(menu).toBeTruthy();
      return menu as HTMLElement;
    });

    await userEvent.click(within(firstMenu).getByRole("button", { name: "Translate with agent" }));

    const dialog = await screen.findByRole("dialog", { name: "Translate with agent" });
    expect(screen.getByTestId("render-count")).toHaveTextContent("1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Translate with agent" }),
      ).not.toBeInTheDocument();
    });

    await openOptionsMenu(container);

    await waitFor(() => {
      const menu = document.querySelector('[data-file-tree-context-menu-root="true"]');
      expect(menu).toBeTruthy();
      expect(menu?.textContent).toContain("Translate with agent");
      expect(menu?.textContent).toContain("Import translations");
      expect(menu?.textContent).toContain("Download");
    });
  });
});
