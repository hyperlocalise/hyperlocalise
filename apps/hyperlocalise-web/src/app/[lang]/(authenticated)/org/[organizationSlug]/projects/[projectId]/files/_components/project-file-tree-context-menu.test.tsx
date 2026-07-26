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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ContextMenuOpenContext } from "@pierre/trees";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { createProjectFileRecord } from "./project-files.fixture";
import { ProjectFileTreeContextMenu } from "./project-file-tree-context-menu";

describe("ProjectFileTreeContextMenu", () => {
  it("closes the tree menu before opening the translation dialog", async () => {
    const events: string[] = [];
    const close = vi.fn(() => events.push("close"));
    const onTranslateFile = vi.fn(() => events.push("translate"));
    const file = createProjectFileRecord({
      sourcePath: "marketing/pricing.json",
      storedFileId: "file_pricing",
    });

    render(
      <IntlProvider locale="en" messages={{}}>
        <ProjectFileTreeContextMenu
          file={file}
          context={{ close } as unknown as ContextMenuOpenContext}
          fileActions={{
            organizationSlug: "acme",
            projectId: "proj_1",
            highlightLocale: null,
            projectTargetLocales: ["fr"],
            onViewStrings: vi.fn(),
            onTranslateFile,
          }}
          capabilities={{
            canOpenCat: true,
            canTranslateWithAgent: true,
            catHref: "/cat",
            isNativeFile: true,
            translateDisabledTitle: undefined,
          }}
        />
      </IntlProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Translate with agent" }));

    await waitFor(() => {
      expect(onTranslateFile).toHaveBeenCalledWith(file);
    });
    expect(close).toHaveBeenCalledWith({ restoreFocus: false });
    expect(events).toEqual(["close", "translate"]);
  });

  it("schedules dialog open on a macrotask after close", () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      const close = vi.fn(() => events.push("close"));
      const onTranslateFile = vi.fn(() => events.push("translate"));
      const onImportFile = vi.fn(() => events.push("import"));
      const onDownloadFile = vi.fn(() => events.push("download"));
      const file = createProjectFileRecord({
        sourcePath: "marketing/pricing.json",
        storedFileId: "file_pricing",
      });

      const { unmount } = render(
        <IntlProvider locale="en" messages={{}}>
          <ProjectFileTreeContextMenu
            file={file}
            context={{ close } as unknown as ContextMenuOpenContext}
            fileActions={{
              organizationSlug: "acme",
              projectId: "proj_1",
              highlightLocale: null,
              projectTargetLocales: ["fr"],
              onViewStrings: vi.fn(),
              onTranslateFile,
              onImportFile,
              onDownloadFile,
            }}
            capabilities={{
              canOpenCat: true,
              canTranslateWithAgent: true,
              catHref: "/cat",
              isNativeFile: true,
              translateDisabledTitle: undefined,
            }}
          />
        </IntlProvider>,
      );

      screen.getByRole("button", { name: "Translate with agent" }).click();
      expect(events).toEqual(["close"]);
      expect(onTranslateFile).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(events).toEqual(["close", "translate"]);

      events.length = 0;
      close.mockClear();
      unmount();
      render(
        <IntlProvider locale="en" messages={{}}>
          <ProjectFileTreeContextMenu
            file={file}
            context={{ close } as unknown as ContextMenuOpenContext}
            fileActions={{
              organizationSlug: "acme",
              projectId: "proj_1",
              highlightLocale: null,
              projectTargetLocales: ["fr"],
              onViewStrings: vi.fn(),
              onTranslateFile,
              onImportFile,
              onDownloadFile,
            }}
            capabilities={{
              canOpenCat: true,
              canTranslateWithAgent: true,
              catHref: "/cat",
              isNativeFile: true,
              translateDisabledTitle: undefined,
            }}
          />
        </IntlProvider>,
      );

      screen.getByRole("button", { name: "Import translations" }).click();
      expect(events).toEqual(["close"]);
      vi.runAllTimers();
      expect(events).toEqual(["close", "import"]);

      events.length = 0;
      screen.getByRole("button", { name: "Download" }).click();
      expect(events).toEqual(["close"]);
      vi.runAllTimers();
      expect(events).toEqual(["close", "download"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
