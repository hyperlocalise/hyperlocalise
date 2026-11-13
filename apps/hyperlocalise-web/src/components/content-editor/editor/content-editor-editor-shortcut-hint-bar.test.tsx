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

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorEditorShortcutHintBar } from "./content-editor-editor-shortcut-hint-bar";

describe("ContentEditorEditorShortcutHintBar", () => {
  it("renders accessible key combinations for screen readers", () => {
    renderWithContentEditorProviders(<ContentEditorEditorShortcutHintBar isMac={true} />);

    expect(screen.getByRole("note", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("(⌘ + ↵)")).toHaveClass("sr-only");
    expect(screen.getByText("(⌘ + ←)")).toHaveClass("sr-only");
    expect(screen.getByText("(⌘ + →)")).toHaveClass("sr-only");
    expect(screen.getByText("(⌘ + K)")).toHaveClass("sr-only");
  });

  it("renders PC keys when isMac is false", () => {
    renderWithContentEditorProviders(<ContentEditorEditorShortcutHintBar isMac={false} />);

    expect(screen.getByText("(Ctrl + Enter)")).toHaveClass("sr-only");
    expect(screen.getByText("(Ctrl + ←)")).toHaveClass("sr-only");
    expect(screen.getByText("(Ctrl + →)")).toHaveClass("sr-only");
    expect(screen.getByText("(Ctrl + K)")).toHaveClass("sr-only");
  });
});
