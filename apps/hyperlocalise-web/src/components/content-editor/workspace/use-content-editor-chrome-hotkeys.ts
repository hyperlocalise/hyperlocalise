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
import { useHotkeys } from "react-hotkeys-hook";

import { getCatShortcutHotkey } from "@/components/content-editor/editor/content-editor-keyboard-shortcuts";

import type { ContentEditorWorkspaceUiStore } from "./store/content-editor-workspace-ui-store";

const STRING_SEARCH_SELECTOR = "[data-content-editor-string-search='true']";
const COMMENT_INPUT_SELECTOR = "[data-cat-comment-input='true']";

function focusFirstEnabled<T extends HTMLInputElement | HTMLTextAreaElement>(
  selector: string,
  options: { select?: boolean } = {},
) {
  const element = document.querySelector<T>(selector);
  if (!element || element.disabled) {
    return;
  }

  element.scrollIntoView({ block: "nearest" });
  element.focus();
  if (options.select) {
    element.select();
  }
}

/** Shortcuts that act on the page chrome rather than the selected string. */
export function useContentEditorChromeHotkeys({
  ui,
  hasFilesPanel,
}: {
  ui: ContentEditorWorkspaceUiStore;
  hasFilesPanel: boolean;
}) {
  useHotkeys(
    getCatShortcutHotkey("toggleFilesPanel"),
    () => ui.toggleFilesPanel(),
    { enabled: hasFilesPanel, enableOnFormTags: false, preventDefault: true },
    [hasFilesPanel, ui],
  );

  useHotkeys(
    getCatShortcutHotkey("toggleDetailsPanel"),
    () => ui.toggleDetailsPanel(),
    { enableOnFormTags: false, preventDefault: true },
    [ui],
  );

  useHotkeys(
    getCatShortcutHotkey("searchStrings"),
    () => focusFirstEnabled<HTMLInputElement>(STRING_SEARCH_SELECTOR, { select: true }),
    { enableOnFormTags: false, preventDefault: true },
    [],
  );

  useHotkeys(
    getCatShortcutHotkey("addComment"),
    () => focusFirstEnabled<HTMLTextAreaElement>(COMMENT_INPUT_SELECTOR),
    { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true },
    [],
  );

  useHotkeys(
    getCatShortcutHotkey("openShortcuts"),
    () => ui.openChromeDialog("shortcuts"),
    { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true },
    [ui],
  );
}
