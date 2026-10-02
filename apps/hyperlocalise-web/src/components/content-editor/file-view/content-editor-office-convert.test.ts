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
// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vite-plus/test";

import { BuildTextUtils, HorizontalAlign, NamedStyleType, PresetListType } from "@univerjs/core";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import PptxGenJS from "pptxgenjs";

import {
  decodeXmlTextEntities,
  emptyOfficeSnapshot,
  exportOfficeSnapshotToFile,
  loadOfficeSnapshotFromFile,
  plainTextFromDocument,
} from "./content-editor-office-convert";

// Tests load mammoth's Node build, which reads `buffer` where the browser build reads `arrayBuffer`.
vi.mock("mammoth", async (importOriginal) => {
  const { default: mammoth } = await importOriginal<{ default: typeof import("mammoth") }>();
  return {
    default: {
      ...mammoth,
      convertToHtml: (input: { arrayBuffer: ArrayBuffer }, options?: object) =>
        mammoth.convertToHtml({ buffer: Buffer.from(input.arrayBuffer) }, options),
    },
  };
});

async function loadDocx(children: (Paragraph | Table)[]) {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children }] }));
  const snapshot = await loadOfficeSnapshotFromFile({
    kind: "docx",
    file: new File([new Uint8Array(buffer)], "brief.docx"),
  });
  if (snapshot.kind !== "docx") {
    throw new Error("expected docx snapshot");
  }
  return snapshot.data;
}

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
    snapshot.data.body = BuildTextUtils.transform.fromPlainText("Hello from CAT");

    const file = await exportOfficeSnapshotToFile({
      snapshot,
      filename: "brief.docx",
    });

    expect(file.name).toBe("brief.docx");
    expect(file.type).toContain("wordprocessingml");
    expect(file.size).toBeGreaterThan(0);
  });

  it("keeps headings, alignment, and text formatting from a docx file", async () => {
    const data = await loadDocx([
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun("Quarterly brief")],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun("Click "),
          new TextRun({ text: "Save", bold: true }),
          new TextRun({ text: " now", italics: true, underline: {} }),
        ],
      }),
      new Paragraph("Plain line"),
    ]);

    expect(plainTextFromDocument(data)).toBe("Quarterly brief\rClick Save now\rPlain line");
    expect(data.body?.paragraphs?.map((paragraph) => paragraph.paragraphStyle)).toMatchObject([
      { namedStyleType: NamedStyleType.HEADING_1, horizontalAlign: HorizontalAlign.CENTER },
      { horizontalAlign: HorizontalAlign.RIGHT },
      undefined,
    ]);
    expect(data.body?.textRuns).toMatchObject([
      { st: 22, ed: 26, ts: { bl: 1 } },
      { st: 26, ed: 30, ts: { it: 1, ul: { s: 1 } } },
    ]);
  });

  it("keeps nested lists and links from a docx file", async () => {
    const data = await loadDocx([
      new Paragraph({ bullet: { level: 0 }, children: [new TextRun("First point")] }),
      new Paragraph({ bullet: { level: 1 }, children: [new TextRun("Nested point")] }),
      new Paragraph({
        children: [
          new ExternalHyperlink({
            link: "https://example.com",
            children: [new TextRun("our site")],
          }),
        ],
      }),
    ]);

    expect(plainTextFromDocument(data)).toBe("First point\rNested point\rour site");
    expect(data.body?.paragraphs?.map((paragraph) => paragraph.bullet)).toMatchObject([
      { listType: PresetListType.BULLET_LIST, nestingLevel: 0 },
      { listType: PresetListType.BULLET_LIST, nestingLevel: 1 },
      undefined,
    ]);
    expect(data.body?.customRanges).toMatchObject([
      { properties: { url: "https://example.com/" } },
    ]);
  });

  it("fits docx tables to the page and aligns cell text", async () => {
    const data = await loadDocx([
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Plan")] }),
              new TableCell({
                children: [
                  new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("$20")] }),
                ],
              }),
            ],
          }),
        ],
      }),
    ]);

    const [table] = Object.values(data.tableSource ?? {});
    const textWidth = 595.3 - 90 - 90;
    expect(table?.size.width.v).toBeCloseTo(textWidth);
    expect(table?.tableColumns.map((column) => column.size.width.v)).toEqual([
      expect.closeTo(textWidth / 2),
      expect.closeTo(textWidth / 2),
    ]);
    // A table always has a paragraph before and after it.
    expect(
      data.body?.paragraphs?.map((paragraph) => paragraph.paragraphStyle?.horizontalAlign),
    ).toEqual([undefined, undefined, HorizontalAlign.RIGHT, undefined]);
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

  it("imports slide text from a generated pptx file", async () => {
    const pptx = new PptxGenJS();
    const page = pptx.addSlide();
    page.addText("Localization progress", { x: 0.5, y: 0.6, w: 9, h: 1, fontSize: 28, bold: true });
    page.addText("Q1 review for customer-facing strings and assets.", {
      x: 0.5,
      y: 1.8,
      w: 9,
      h: 3,
      fontSize: 18,
    });
    const buffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
    const file = new File([buffer], "quarterly-review.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    const snapshot = await loadOfficeSnapshotFromFile({
      kind: "pptx",
      file,
      title: "quarterly-review.pptx",
    });

    expect(snapshot.kind).toBe("pptx");
    if (snapshot.kind !== "pptx") {
      throw new Error("expected pptx snapshot");
    }

    const slideText = snapshot.data.body?.pageOrder
      .map((pageId) => {
        const pageData = snapshot.data.body?.pages[pageId];
        if (!pageData) {
          return "";
        }
        return Object.values(pageData.pageElements)
          .map((element) => element.richText?.text?.trim() || "")
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");

    expect(slideText).toContain("Localization progress");
    expect(slideText).toContain("Q1 review for customer-facing strings and assets.");
  });
});
