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

import {
  isContentEditorGroupingAvailable,
  isNativeContentEditorFile,
  isNativeContentEditorProviderKind,
} from "./content-editor-native-project";

describe("isNativeContentEditorProviderKind", () => {
  it("treats missing and native kinds as native", () => {
    expect(isNativeContentEditorProviderKind(null)).toBe(true);
    expect(isNativeContentEditorProviderKind(undefined)).toBe(true);
    expect(isNativeContentEditorProviderKind("native")).toBe(true);
  });

  it("rejects external TMS providers", () => {
    expect(isNativeContentEditorProviderKind("crowdin")).toBe(false);
    expect(isNativeContentEditorProviderKind("github")).toBe(false);
  });
});

describe("isNativeContentEditorFile", () => {
  it("treats files without a provider kind as native", () => {
    expect(isNativeContentEditorFile(null)).toBe(true);
    expect(isNativeContentEditorFile({})).toBe(true);
    expect(isNativeContentEditorFile({ provider: null })).toBe(true);
    expect(isNativeContentEditorFile({ provider: {} })).toBe(true);
    expect(isNativeContentEditorFile({ provider: { kind: "native" } })).toBe(true);
  });

  it("rejects files attached to an external provider", () => {
    expect(isNativeContentEditorFile({ provider: { kind: "crowdin" } })).toBe(false);
  });
});

describe("isContentEditorGroupingAvailable", () => {
  it("requires a loaded native file", () => {
    expect(isContentEditorGroupingAvailable(null)).toBe(false);
    expect(isContentEditorGroupingAvailable(undefined)).toBe(false);
    expect(isContentEditorGroupingAvailable({ provider: { kind: "native" } })).toBe(true);
    expect(isContentEditorGroupingAvailable({ provider: { kind: "crowdin" } })).toBe(false);
  });
});
