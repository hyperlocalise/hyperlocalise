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

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  ContentEditorShortcutHint,
  ContentEditorShortcutHintsProvider,
  SHORTCUT_HINT_HOLD_MS,
} from "./content-editor-shortcut-hints";

vi.mock("@/hooks/use-is-mac", () => ({ useIsMac: () => false }));

function renderHint() {
  render(
    <ContentEditorShortcutHintsProvider>
      <button type="button" className="relative">
        Save
        <ContentEditorShortcutHint shortcut="saveDraft" />
      </button>
    </ContentEditorShortcutHintsProvider>,
  );
}

function hintBadge() {
  return document.querySelector("[data-content-editor-shortcut-hint='saveDraft']");
}

describe("ContentEditorShortcutHintsProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals badges after holding the modifier and hides them on release", () => {
    renderHint();

    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS - 1);
    });
    expect(hintBadge()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(hintBadge()).toHaveTextContent("Ctrl+S");
    expect(hintBadge()).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    fireEvent.keyUp(window, { key: "Control" });
    expect(hintBadge()).toBeNull();
  });

  it("does not reveal badges when the modifier is part of a chord", () => {
    renderHint();

    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    });

    expect(hintBadge()).toBeNull();
  });

  it("hides revealed badges when the window loses focus", () => {
    renderHint();

    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    act(() => {
      vi.advanceTimersByTime(SHORTCUT_HINT_HOLD_MS);
    });
    expect(hintBadge()).not.toBeNull();

    fireEvent.blur(window);
    expect(hintBadge()).toBeNull();
  });
});
