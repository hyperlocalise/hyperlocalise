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

import { supportsProviderContentEditorFile } from "./provider-content-editor-capabilities";

describe("supportsProviderContentEditorFile", () => {
  it("returns false without provider metadata", () => {
    expect(supportsProviderContentEditorFile({})).toBe(false);
    expect(supportsProviderContentEditorFile({ provider: null })).toBe(false);
  });

  it("supports Crowdin file resources", () => {
    expect(
      supportsProviderContentEditorFile({
        provider: { kind: "crowdin", resourceType: "file" },
      }),
    ).toBe(true);
    expect(
      supportsProviderContentEditorFile({
        provider: { kind: "crowdin", resourceType: "key" },
      }),
    ).toBe(false);
  });

  it("supports Phrase file and key resources", () => {
    expect(
      supportsProviderContentEditorFile({
        provider: { kind: "phrase", resourceType: "file" },
      }),
    ).toBe(true);
    expect(
      supportsProviderContentEditorFile({
        provider: { kind: "phrase", resourceType: "key" },
      }),
    ).toBe(true);
  });

  it("supports Lokalise file and key resources", () => {
    expect(
      supportsProviderContentEditorFile({
        provider: { kind: "lokalise", resourceType: "file" },
      }),
    ).toBe(true);
    expect(
      supportsProviderContentEditorFile({
        provider: { kind: "lokalise", resourceType: "key" },
      }),
    ).toBe(true);
  });

  it("returns false for providers without live CAT yet", () => {
    expect(
      supportsProviderContentEditorFile({
        provider: { kind: "smartling", resourceType: "file" },
      }),
    ).toBe(false);
  });
});
