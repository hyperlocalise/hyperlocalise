/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
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

    expect(close).toHaveBeenCalledWith({ restoreFocus: false });
    expect(onTranslateFile).toHaveBeenCalledWith(file);
    expect(events).toEqual(["close", "translate"]);
  });
});
