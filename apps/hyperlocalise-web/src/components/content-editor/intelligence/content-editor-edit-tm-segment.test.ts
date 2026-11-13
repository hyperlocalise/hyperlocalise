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

import type { ContentEditorTmSegmentRecord } from "@/lib/translation/content-editor-tm-segment";

import { findTmRecordForLocale } from "./content-editor-edit-tm-segment";

function record(locale: string): ContentEditorTmSegmentRecord {
  return { id: `id-${locale}`, locale, text: locale, isSource: false };
}

describe("findTmRecordForLocale", () => {
  const records = [record("fr"), record("pt-BR"), record("pt-PT"), record("zh_Hans")];

  it("returns undefined without a locale", () => {
    expect(findTmRecordForLocale(records, undefined)).toBeUndefined();
  });

  it("matches exact tags case- and separator-insensitively", () => {
    expect(findTmRecordForLocale(records, "pt-br")?.locale).toBe("pt-BR");
    expect(findTmRecordForLocale(records, "zh-Hans")?.locale).toBe("zh_Hans");
  });

  it("falls back to a unique primary-language match", () => {
    expect(findTmRecordForLocale(records, "fr-FR")?.locale).toBe("fr");
  });

  it("does not guess between ambiguous regional variants", () => {
    expect(findTmRecordForLocale(records, "pt")).toBeUndefined();
  });
});
