"use client";

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
import { useCallback, useEffect, useRef } from "react";
import type { FileTree, FileTreeDirectoryHandle, FileTreeItemHandle } from "@pierre/trees";

import {
  readBrowserLocalStorageItem,
  writeBrowserLocalStorageItem,
} from "@/lib/primitives/browser-local-storage/browser-local-storage";

const STORAGE_PREFIX = "hyperlocalise:project-files-tree:collapsed-folders:v1:";
const MAX_STORED_FOLDERS = 500;

type CollapsibleFileTree = Pick<
  FileTree,
  "getItem" | "getSearchValue" | "getVisibleCount" | "getVisibleRows" | "subscribe"
>;

function isDirectoryHandle(item: FileTreeItemHandle): item is FileTreeDirectoryHandle {
  return item.isDirectory();
}

export function projectFilesTreeCollapsedFoldersStorageKey(scope: string) {
  return `${STORAGE_PREFIX}${scope}`;
}

function readCollapsedFolders(storageKey: string | undefined): Set<string> {
  if (!storageKey) {
    return new Set();
  }
  try {
    const parsed: unknown = JSON.parse(readBrowserLocalStorageItem(storageKey) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((path) => typeof path === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Keeps folders the user collapsed collapsed. Pierre rebuilds its store fully expanded on
 * `resetPaths`, so callers run resets through `preserveCollapsedFolders`. With a storage key the
 * collapsed set also survives reloads.
 */
export function useProjectFilesTreeCollapsedFolders(
  model: CollapsibleFileTree,
  storageKey: string | undefined,
) {
  const collapsedRef = useRef<Set<string> | null>(null);
  const isRestoringRef = useRef(false);

  const restore = useCallback(() => {
    const collapsed = collapsedRef.current;
    if (!collapsed || collapsed.size === 0) {
      return;
    }
    isRestoringRef.current = true;
    try {
      for (const path of collapsed) {
        const item = model.getItem(path);
        if (item && isDirectoryHandle(item) && item.isExpanded()) {
          item.collapse();
        }
      }
    } finally {
      isRestoringRef.current = false;
    }
  }, [model]);

  const preserveCollapsedFolders = useCallback(
    (update: () => void) => {
      isRestoringRef.current = true;
      try {
        update();
      } finally {
        isRestoringRef.current = false;
      }
      restore();
    },
    [restore],
  );

  useEffect(() => {
    collapsedRef.current = readCollapsedFolders(storageKey);
    restore();

    return model.subscribe(() => {
      const collapsed = collapsedRef.current;
      // Search reveals matches inside collapsed folders; that is not the user's choice.
      if (!collapsed || isRestoringRef.current || model.getSearchValue()) {
        return;
      }
      let changed = false;
      for (const row of model.getVisibleRows(0, model.getVisibleCount())) {
        if (row.kind !== "directory") {
          continue;
        }
        if (row.isExpanded) {
          changed = collapsed.delete(row.path) || changed;
        } else if (!collapsed.has(row.path)) {
          collapsed.add(row.path);
          changed = true;
        }
      }
      if (changed && storageKey) {
        writeBrowserLocalStorageItem(
          storageKey,
          JSON.stringify([...collapsed].slice(-MAX_STORED_FOLDERS)),
        );
      }
    });
  }, [model, restore, storageKey]);

  return { preserveCollapsedFolders, restoreCollapsedFolders: restore };
}
