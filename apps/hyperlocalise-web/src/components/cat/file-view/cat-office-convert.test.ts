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
  decodeXmlTextEntities,
  emptyOfficeSnapshot,
  exportOfficeSnapshotToFile,
} from "./cat-office-convert";

describe("cat-office-convert", () => {
  it("decodes XML text entities without double-unescaping", () => {
    expect(decodeXmlTextEntities("A &amp; B")).toBe("A & B");
    expect(decodeXmlTextEntities("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeXmlTextEntities("&amp;lt;")).toBe("&lt;");
    expect(decodeXmlTextEntities("&quot;hi&#39;")).toBe("\"hi'");
  });

  it("builds empty snapshots for each office kind", () => {
    expect(emptyOfficeSnapshot("docx", "brief.docx").kind).toBe("docx");
    expect(emptyOfficeSnapshot("xlsx", "rates.xlsx").kind).toBe("xlsx");
    expect(emptyOfficeSnapshot("pptx", "deck.pptx").kind).toBe("pptx");
  });

  it("exports a docx file from a document snapshot", async () => {
    const snapshot = emptyOfficeSnapshot("docx", "brief.docx");
    if (snapshot.kind !== "docx") {
      throw new Error("expected docx snapshot");
    }
    snapshot.data.body = {
      dataStream: "Hello from CAT\r\n",
      paragraphs: [{ startIndex: 14 }],
    };

    const file = await exportOfficeSnapshotToFile({
      snapshot,
      filename: "brief.docx",
    });

    expect(file.name).toBe("brief.docx");
    expect(file.type).toContain("wordprocessingml");
    expect(file.size).toBeGreaterThan(0);
  });

  it("exports a pptx file from a slide snapshot", async () => {
    const snapshot = emptyOfficeSnapshot("pptx", "deck.pptx");
    const file = await exportOfficeSnapshotToFile({
      snapshot,
      filename: "deck.pptx",
    });

    expect(file.name).toBe("deck.pptx");
    expect(file.type).toContain("presentationml");
    expect(file.size).toBeGreaterThan(0);
  });
});
