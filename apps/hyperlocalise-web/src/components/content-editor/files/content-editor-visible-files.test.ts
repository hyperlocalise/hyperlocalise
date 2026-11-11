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
import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import {
  hasHiddenContentEditorFiles,
  resolveVisibleContentEditorFiles,
} from "./content-editor-visible-files";

function file(sourcePath: string, isHidden?: boolean): ProjectFileRecord {
  return { sourcePath, ...(isHidden === undefined ? {} : { isHidden }) } as ProjectFileRecord;
}

const files = [file("a.json"), file("hidden.json", true), file("other-hidden.json", true)];

describe("resolveVisibleContentEditorFiles", () => {
  it("keeps every file when hidden files are shown", () => {
    expect(resolveVisibleContentEditorFiles(files, false, null)).toBe(files);
  });

  it("drops hidden files but keeps the open one", () => {
    expect(
      resolveVisibleContentEditorFiles(files, true, "hidden.json").map((entry) => entry.sourcePath),
    ).toEqual(["a.json", "hidden.json"]);
  });

  it("leaves lists without hidden flags untouched", () => {
    const unflagged = [file("a.json"), file("b.json", false)];
    expect(hasHiddenContentEditorFiles(unflagged)).toBe(false);
    expect(resolveVisibleContentEditorFiles(unflagged, true, null)).toBe(unflagged);
  });
});
