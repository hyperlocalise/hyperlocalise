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

import { filterKnowledgeUploadFiles, KNOWLEDGE_UPLOAD_MAX_FILES } from "./knowledge-upload.shared";

function file(name: string) {
  return new File(["content"], name, { type: "text/plain" });
}

describe("filterKnowledgeUploadFiles", () => {
  it("keeps the first supported file and caps at one", () => {
    const files = [
      file("brand.md"),
      file("terms.csv"),
      file("notes.txt"),
      file("deck.pptx"),
      file("extra.json"),
      file("overflow.pdf"),
      file("skip.exe"),
    ];

    const accepted = filterKnowledgeUploadFiles(files);

    expect(KNOWLEDGE_UPLOAD_MAX_FILES).toBe(1);
    expect(accepted).toHaveLength(1);
    expect(accepted.map((item) => item.name)).toEqual(["brand.md"]);
  });

  it("drops unsupported formats", () => {
    expect(filterKnowledgeUploadFiles([file("skip.exe"), file("photo.png")])).toEqual([]);
  });
});
