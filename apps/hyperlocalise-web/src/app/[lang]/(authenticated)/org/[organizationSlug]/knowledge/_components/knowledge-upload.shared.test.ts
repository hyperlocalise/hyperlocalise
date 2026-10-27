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

import { filterKnowledgeUploadFiles } from "./knowledge-upload.shared";

function file(name: string) {
  return new File(["content"], name, { type: "text/plain" });
}

describe("filterKnowledgeUploadFiles", () => {
  it("keeps the first supported file and caps at one", () => {
    const files = [file("terms.csv"), file("brand.md"), file("notes.txt"), file("overflow.pdf")];

    const accepted = filterKnowledgeUploadFiles(files);

    expect(accepted).toHaveLength(1);
    expect(accepted.map((item) => item.name)).toEqual(["brand.md"]);
  });

  it("accepts every format the guideline extractor supports", () => {
    for (const name of ["a.pdf", "b.DOCX", "c.md", "d.markdown", "e.txt"]) {
      expect(filterKnowledgeUploadFiles([file(name)])).toHaveLength(1);
    }
  });

  it("drops unsupported formats", () => {
    expect(
      filterKnowledgeUploadFiles([
        file("skip.exe"),
        file("photo.png"),
        file("terms.csv"),
        file("deck.pptx"),
        file("sheet.xlsx"),
        file("extra.json"),
      ]),
    ).toEqual([]);
  });
});
