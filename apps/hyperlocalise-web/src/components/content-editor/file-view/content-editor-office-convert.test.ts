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

import { describe, expect, it } from "vite-plus/test";

import { BuildTextUtils, PresetListType, type IDocumentData } from "@univerjs/core";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

import { buildStyledDocxFixture } from "./content-editor-docx-import.fixture";
import {
  decodeXmlTextEntities,
  emptyOfficeSnapshot,
  exportOfficeSnapshotToFile,
  loadOfficeSnapshotFromFile,
} from "./content-editor-office-convert";

const STEPS_NUMBERING = {
  config: [
    {
      reference: "steps",
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START },
      ],
    },
  ],
};

async function loadDocxFile(file: File) {
  const snapshot = await loadOfficeSnapshotFromFile({ kind: "docx", file });
  if (snapshot.kind !== "docx") {
    throw new Error("expected docx snapshot");
  }
  return snapshot.data;
}

async function loadDocx(children: (Paragraph | Table)[]) {
  const buffer = await Packer.toBuffer(
    new Document({ numbering: STEPS_NUMBERING, sections: [{ children }] }),
  );
  return loadDocxFile(new File([new Uint8Array(buffer)], "brief.docx"));
}

function saveDocx(data: IDocumentData) {
  return exportOfficeSnapshotToFile({ snapshot: { kind: "docx", data }, filename: "brief.docx" });
}

async function documentXml(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  return (await zip.file("word/document.xml")?.async("string")) ?? "";
}

/** The parts of a document that should survive a save, without generated ids. */
function documentShape(data: IDocumentData) {
  return {
    page: data.documentStyle,
    stream: data.body?.dataStream,
    paragraphs: data.body?.paragraphs?.map((paragraph) => ({
      startIndex: paragraph.startIndex,
      heading: paragraph.paragraphStyle?.namedStyleType,
      align: paragraph.paragraphStyle?.horizontalAlign,
      list: paragraph.bullet && [paragraph.bullet.listType, paragraph.bullet.nestingLevel],
    })),
    textRuns: data.body?.textRuns?.map(({ st, ed, ts }) => ({ st, ed, ts })),
    links: data.body?.customRanges?.map((range) => [
      range.startIndex,
      range.endIndex,
      range.properties?.url,
    ]),
    tables: data.body?.tables?.map((table) => ({
      startIndex: table.startIndex,
      endIndex: table.endIndex,
      columns: data.tableSource?.[table.tableId]?.tableColumns.map((column) => column.size.width.v),
      spans: data.tableSource?.[table.tableId]?.tableRows.map((row) =>
        row.tableCells.map((cell) => [cell.rowSpan, cell.columnSpan]),
      ),
    })),
  };
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

  it("keeps a document's structure and formatting across save and reopen", async () => {
    const opened = await loadDocx([
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun("Quarterly brief")],
      }),
      new Paragraph({
        alignment: AlignmentType.BOTH,
        children: [
          new TextRun("Click "),
          new TextRun({ text: "Save", bold: true }),
          new TextRun({ text: " now", italics: true, underline: {} }),
          new TextRun({ text: " or not", strike: true }),
          new TextRun({ text: "2", superScript: true }),
          new TextRun(" at "),
          new ExternalHyperlink({
            link: "https://example.com",
            children: [new TextRun("our site")],
          }),
          new TextRun("."),
        ],
      }),
      new Paragraph({ bullet: { level: 0 }, children: [new TextRun("First point")] }),
      new Paragraph({ bullet: { level: 1 }, children: [new TextRun("Nested point")] }),
      new Paragraph({
        numbering: { reference: "steps", level: 0 },
        children: [new TextRun("Step one")],
      }),
      new Paragraph({
        numbering: { reference: "steps", level: 0 },
        children: [new TextRun("Step two")],
      }),
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
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("After the table")] }),
    ]);

    const reopened = await loadDocxFile(await saveDocx(opened));

    expect(documentShape(reopened)).toEqual(documentShape(opened));
    expect(opened.body?.paragraphs?.[4]?.bullet?.listType).toBe(PresetListType.ORDER_LIST);
    expect(opened.body?.tables).toHaveLength(1);
  });

  it("keeps style-based size, colour, and alignment across save and reopen", async () => {
    const opened = await loadDocxFile(new File([await buildStyledDocxFixture()], "report.docx"));

    const saved = await saveDocx(opened);
    const reopened = await loadDocxFile(saved);

    expect(documentShape(reopened)).toEqual(documentShape(opened));
    const xml = await documentXml(saved);
    expect(xml).toContain('<w:sz w:val="36"/>');
    expect(xml).toContain('<w:color w:val="FF0000"/>');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain("<w:tab/>");
  });

  it("writes page size, column widths, and separate numbering for each ordered list", async () => {
    const opened = await loadDocx([
      new Paragraph({
        numbering: { reference: "steps", level: 0 },
        children: [new TextRun("One")],
      }),
      new Paragraph("Between the lists"),
      new Paragraph({
        numbering: { reference: "steps", level: 0, instance: 1 },
        children: [new TextRun("One again")],
      }),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Plan")] }),
              new TableCell({ children: [new Paragraph("Price")] }),
            ],
          }),
        ],
      }),
    ]);

    const xml = await documentXml(await saveDocx(opened));

    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"');
    // Unformatted text must not switch off what a paragraph style turns on.
    expect(xml).not.toContain('w:val="false"');
    expect(xml.match(/<w:gridCol w:w="4513"\/>/g)).toHaveLength(2);
    const numberingIds = [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((match) => match[1]);
    expect(numberingIds).toHaveLength(2);
    expect(new Set(numberingIds).size).toBe(2);
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
