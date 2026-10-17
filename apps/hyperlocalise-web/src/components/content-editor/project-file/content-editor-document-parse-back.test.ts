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
import { describe, expect, it, vi } from "vite-plus/test";

import {
  isParseBackDocumentPath,
  saveDocumentParseBackDrafts,
} from "./content-editor-document-parse-back";

describe("saveDocumentParseBackDrafts", () => {
  it("saves every change and reports failed saves with the unmapped edits", async () => {
    const changes = Array.from({ length: 6 }, (_, index) => ({
      externalStringId: `id-${index}`,
      key: `md.p.${index}`,
      targetText: `Texte ${index}`,
    }));
    const saveDraft = vi.fn(async (id: string) => {
      if (id === "id-4") {
        throw new Error("Target is missing placeholders (MD#0).");
      }
    });
    const unmapped = [{ key: "md.h1", text: "Nouveau", reason: "unknown_key" as const }];

    const result = await saveDocumentParseBackDrafts({
      parse: async () => ({ changes, unmapped }),
      saveDraft,
    });

    expect(saveDraft).toHaveBeenCalledTimes(6);
    expect(saveDraft).toHaveBeenCalledWith("id-0", "Texte 0");
    expect(result).toEqual({
      saved: 5,
      failed: [{ key: "md.p.4", message: "Target is missing placeholders (MD#0)." }],
      unmapped,
    });
  });
});

describe("isParseBackDocumentPath", () => {
  it("accepts the formats the go-svc parser keys", () => {
    expect(isParseBackDocumentPath("docs/guide.MDX")).toBe(true);
    expect(isParseBackDocumentPath("site/index.html")).toBe(true);
    expect(isParseBackDocumentPath("docs/guide.adoc")).toBe(false);
  });
});
