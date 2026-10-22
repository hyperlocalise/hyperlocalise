// @vitest-environment happy-dom

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
import { FileTree, type FileTreeDirectoryHandle } from "@pierre/trees";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  projectFilesTreeCollapsedFoldersStorageKey,
  useProjectFilesTreeCollapsedFolders,
} from "./use-project-files-tree-collapsed-folders";

const PATHS = ["docs/guide.json", "docs/intro.json", "src/app.json"];
const STORAGE_KEY = projectFilesTreeCollapsedFoldersStorageKey("acme:project-1");

function createTree() {
  return new FileTree({ initialExpansion: "open", paths: PATHS });
}

function directory(tree: FileTree, path: string) {
  return tree.getItem(path) as FileTreeDirectoryHandle;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("useProjectFilesTreeCollapsedFolders", () => {
  it("keeps a collapsed folder collapsed when the paths are reset", () => {
    const tree = createTree();
    const { result } = renderHook(() => useProjectFilesTreeCollapsedFolders(tree, STORAGE_KEY));

    act(() => directory(tree, "docs/").collapse());
    act(() => result.current.preserveCollapsedFolders(() => tree.resetPaths(PATHS)));

    expect(directory(tree, "docs/").isExpanded()).toBe(false);
    expect(directory(tree, "src/").isExpanded()).toBe(true);
  });

  it("restores collapsed folders from localStorage on mount", () => {
    const first = createTree();
    const { unmount } = renderHook(() => useProjectFilesTreeCollapsedFolders(first, STORAGE_KEY));
    act(() => directory(first, "docs/").collapse());
    unmount();

    const second = createTree();
    renderHook(() => useProjectFilesTreeCollapsedFolders(second, STORAGE_KEY));

    expect(directory(second, "docs/").isExpanded()).toBe(false);
    expect(directory(second, "src/").isExpanded()).toBe(true);
  });

  it("forgets a folder once the user expands it again", () => {
    const tree = createTree();
    const { result } = renderHook(() => useProjectFilesTreeCollapsedFolders(tree, STORAGE_KEY));

    act(() => directory(tree, "docs/").collapse());
    act(() => directory(tree, "docs/").expand());
    act(() => result.current.preserveCollapsedFolders(() => tree.resetPaths(PATHS)));

    expect(directory(tree, "docs/").isExpanded()).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([]);
  });
});
