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

import { describe, expect, it } from "vite-plus/test";

import { createProjectFileRecord } from "../_components/project-files.fixture";
import {
  fileKey,
  PROJECT_FILES_MAX_UPLOAD,
  ProjectFilesPageStore,
  sourcePathForFile,
} from "./project-files-page-store";

function createUpload(name: string, contents = "body") {
  return new File([contents], name, { type: "application/json" });
}

describe("ProjectFilesPageStore", () => {
  it("dedupes the upload queue by path, size, and lastModified and caps it", () => {
    const store = new ProjectFilesPageStore("acme", "proj_1");
    const first = createUpload("home.json");
    const extra = Array.from({ length: PROJECT_FILES_MAX_UPLOAD }, (_, index) =>
      createUpload(`file-${index}.json`),
    );

    store.addSelectedFiles([first, first]);
    expect(store.selectedFiles).toHaveLength(1);
    expect(sourcePathForFile(store.selectedFiles[0]!)).toBe("home.json");
    expect(fileKey(store.selectedFiles[0]!)).toBe(fileKey(first));

    store.addSelectedFiles([first]);
    expect(store.selectedFiles).toHaveLength(1);

    store.addSelectedFiles(extra);
    expect(store.selectedFiles).toHaveLength(PROJECT_FILES_MAX_UPLOAD);

    store.removeSelectedFile(store.selectedFiles[0]!);
    expect(store.selectedFiles).toHaveLength(PROJECT_FILES_MAX_UPLOAD - 1);

    store.clearSelectedFiles();
    expect(store.hasSelectedFiles).toBe(false);
  });

  it("opens one file action at a time and closes the dialog matrix together", () => {
    const store = new ProjectFilesPageStore("acme", "proj_1");
    const home = createProjectFileRecord({ sourcePath: "home.json" });
    const pricing = createProjectFileRecord({ sourcePath: "pricing.json" });

    store.openAction(home, "download");
    expect(store.isDialogOpen).toBe(true);
    expect(store.isActionOpen("download")).toBe(true);
    expect(store.dialogRequest?.file.sourcePath).toBe("home.json");

    store.openAction(pricing, "translate");
    expect(store.isActionOpen("download")).toBe(false);
    expect(store.isActionOpen("translate")).toBe(true);
    expect(store.dialogRequest?.file.sourcePath).toBe("pricing.json");

    store.closeAll();
    expect(store.dialogRequest).toBeNull();
    expect(store.isDialogOpen).toBe(false);
  });

  it("keeps loaded tree files independent from the upload queue", () => {
    const store = new ProjectFilesPageStore("acme", "proj_1");
    const loaded = [createProjectFileRecord({ sourcePath: "home.json" })];

    store.setLoadedFiles(loaded);
    store.addSelectedFiles([createUpload("new.json")]);

    expect(store.loadedFiles).toEqual(loaded);
    expect(store.selectedFiles).toHaveLength(1);
  });
});
