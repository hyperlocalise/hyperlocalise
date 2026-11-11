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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  insertTextIntoActiveContentEditorTarget,
  markContentEditorTargetInsertFocused,
  registerContentEditorTargetInsert,
  resetContentEditorTargetInsertForTests,
} from "./content-editor-target-insert";

describe("content-editor-target-insert", () => {
  afterEach(() => {
    resetContentEditorTargetInsertForTests();
  });

  it("inserts into the last focused handler", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    registerContentEditorTargetInsert(first);
    registerContentEditorTargetInsert(second);
    markContentEditorTargetInsertFocused(second);

    expect(insertTextIntoActiveContentEditorTarget("€")).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("€");
  });

  it("falls back to a remaining handler after the focused editor unmounts", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    registerContentEditorTargetInsert(first);
    const unregisterSecond = registerContentEditorTargetInsert(second);
    markContentEditorTargetInsertFocused(second);
    unregisterSecond();

    expect(insertTextIntoActiveContentEditorTarget("—")).toBe(true);
    expect(first).toHaveBeenCalledWith("—");
    expect(second).not.toHaveBeenCalled();
  });

  it("returns false when no editor is registered", () => {
    expect(insertTextIntoActiveContentEditorTarget("€")).toBe(false);
    expect(insertTextIntoActiveContentEditorTarget("")).toBe(false);
  });
});
