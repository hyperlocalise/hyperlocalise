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

import { createFileTreeIconResolver } from "@pierre/trees";
import { describe, expect, it } from "vite-plus/test";

import { PROJECT_FILES_TREE_ICONS } from "./project-files-tree-icons";

describe("PROJECT_FILES_TREE_ICONS", () => {
  it("keeps Pierre built-in icons while remapping Word and PowerPoint", () => {
    const { resolveIcon } = createFileTreeIconResolver(PROJECT_FILES_TREE_ICONS);

    expect(resolveIcon("file-tree-icon-file", "Recipe.docx").name).toBe("file-tree-custom-word");
    expect(resolveIcon("file-tree-icon-file", "Wedding.pptx").name).toBe(
      "file-tree-custom-powerpoint",
    );
    expect(resolveIcon("file-tree-icon-file", "report.xlsx")).toMatchObject({
      name: "file-tree-builtin-table",
      token: "table",
    });
    expect(resolveIcon("file-tree-icon-file", "sanity-plugin/page.json")).toMatchObject({
      name: "file-tree-builtin-json",
      token: "json",
    });
  });
});
