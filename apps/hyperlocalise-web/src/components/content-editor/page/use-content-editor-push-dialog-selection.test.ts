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

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { useContentEditorPushDialogSelection } from "./use-content-editor-push-dialog-selection";

const items = [{ sourcePath: "google-drive/a.docx" }, { sourcePath: "google-drive/b.docx" }];

function defaultSelected(
  rows: readonly { sourcePath: string }[],
  sourcePath: string | null,
): string[] {
  if (!sourcePath || !rows.some((row) => row.sourcePath === sourcePath)) {
    return [];
  }
  return [sourcePath];
}

describe("useContentEditorPushDialogSelection", () => {
  it("selects the open file when the dialog opens", () => {
    const { result, rerender } = renderHook(
      (props: { open: boolean; items: typeof items | undefined }) =>
        useContentEditorPushDialogSelection({
          open: props.open,
          automationId: "automation-1",
          sourcePath: "google-drive/a.docx",
          items: props.items,
          defaultSelectedSourcePaths: defaultSelected,
        }),
      { initialProps: { open: true, items } },
    );
    expect(result.current.selectedSourcePaths).toEqual(["google-drive/a.docx"]);

    rerender({ open: true, items: [...items, { sourcePath: "google-drive/c.docx" }] });
    expect(result.current.selectedSourcePaths).toEqual(["google-drive/a.docx"]);
  });

  it("keeps the current selection after items refresh", () => {
    const { result, rerender } = renderHook(
      (props: { items: typeof items }) =>
        useContentEditorPushDialogSelection({
          open: true,
          automationId: "automation-1",
          sourcePath: "google-drive/a.docx",
          items: props.items,
          defaultSelectedSourcePaths: defaultSelected,
        }),
      { initialProps: { items } },
    );

    act(() => {
      result.current.setSelectedSourcePaths(["google-drive/b.docx"]);
    });
    rerender({ items: [...items] });
    expect(result.current.selectedSourcePaths).toEqual(["google-drive/b.docx"]);
  });
});
