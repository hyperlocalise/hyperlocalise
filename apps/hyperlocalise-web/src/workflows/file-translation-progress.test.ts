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

import { collectCompletedTranslationPageEntries } from "./file-translation-progress";

describe("collectCompletedTranslationPageEntries", () => {
  it("keeps completed translations from the extracted output", () => {
    expect(
      collectCompletedTranslationPageEntries({
        keys: ["greeting"],
        extracted: { greeting: "Bonjour" },
        prefills: {},
      }),
    ).toEqual({ greeting: "Bonjour" });
  });

  it("skips prefill-only keys that are missing from the output", () => {
    expect(
      collectCompletedTranslationPageEntries({
        keys: ["greeting", "workspace"],
        extracted: { greeting: "Bonjour" },
        prefills: { workspace: "Enable workspace knowledge" },
      }),
    ).toEqual({ greeting: "Bonjour" });
  });

  it("throws when a lockfile-completed key is missing from the output", () => {
    expect(() =>
      collectCompletedTranslationPageEntries({
        keys: ["greeting"],
        extracted: {},
        prefills: {},
      }),
    ).toThrow("completed translation is missing from output");
  });
});
