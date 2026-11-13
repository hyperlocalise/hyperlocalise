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
  SOURCE_EDITABLE_EXTENSIONS,
  isSourceEditableSourcePath,
} from "./source-text-editable-paths";

describe("isSourceEditableSourcePath", () => {
  it("allows the JSON-family extensions the platform can write back", () => {
    expect(SOURCE_EDITABLE_EXTENSIONS).toEqual([".json", ".jsonc", ".arb"]);
    expect(isSourceEditableSourcePath("locales/en.json")).toBe(true);
    expect(isSourceEditableSourcePath("Locales/EN.JSON")).toBe(true);
    expect(isSourceEditableSourcePath("messages.jsonc")).toBe(true);
    expect(isSourceEditableSourcePath("lib/l10n/app_en.arb")).toBe(true);
  });

  it("refuses formats without a source-text writer", () => {
    expect(isSourceEditableSourcePath("locales/en.yaml")).toBe(false);
    expect(isSourceEditableSourcePath("strings.xml")).toBe(false);
    expect(isSourceEditableSourcePath("page.html")).toBe(false);
    expect(isSourceEditableSourcePath("guide.md")).toBe(false);
    expect(isSourceEditableSourcePath("file.json.bak")).toBe(false);
    expect(isSourceEditableSourcePath("")).toBe(false);
  });
});
