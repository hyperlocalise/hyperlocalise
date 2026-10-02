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

import {
  HorizontalAlign,
  NamedStyleType,
  PresetListType,
  type IDocumentData,
} from "@univerjs/core";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import { readDocxDocument } from "./content-editor-docx-import";
import { buildStyledDocxFixture } from "./content-editor-docx-import.fixture";

const A4 = { pageSize: { width: 595.3, height: 841.9 }, marginLeft: 90, marginRight: 90 };

type DocxDocument = Awaited<ReturnType<typeof readDocxDocument>>;

/** The text style of the run that covers `text`. */
function styleOf(document: Pick<IDocumentData, "body">, text: string) {
  const index = document.body?.dataStream.indexOf(text) ?? -1;
  expect(index).toBeGreaterThanOrEqual(0);
  return document.body?.textRuns?.find((run) => run.st <= index && index < run.ed)?.ts;
}

function paragraphOf(document: Pick<IDocumentData, "body">, text: string) {
  const stream = document.body?.dataStream ?? "";
  const end = stream.indexOf("\r", stream.indexOf(text));
  return document.body?.paragraphs?.find((paragraph) => paragraph.startIndex === end);
}

describe("readDocxDocument", () => {
  let document: DocxDocument;

  beforeAll(async () => {
    document = await readDocxDocument(await buildStyledDocxFixture(), A4);
  });

  it("reads text size, colour, and font through the style chain", () => {
    expect(styleOf(document, "Plain")).toEqual({ fs: 11, ff: "Calibri" });
    // Heading 1 sets size and colour; Word headings are not bold unless the style says so.
    expect(styleOf(document, "Overview")).toEqual({
      bl: 0,
      fs: 16,
      ff: "Calibri",
      cl: { rgb: "#2F5496" },
    });
    // "Callout Strong" adds bold and size to the italic and colour of "Callout".
    expect(styleOf(document, "Callout text")).toEqual({
      bl: 1,
      it: 1,
      fs: 14,
      ff: "Calibri",
      cl: { rgb: "#C00000" },
    });
  });

  it("lets direct formatting and character styles override the paragraph style", () => {
    expect(styleOf(document, "big red")).toMatchObject({ fs: 18, cl: { rgb: "#FF0000" } });
    expect(styleOf(document, " marked")).toMatchObject({ fs: 11, bg: { rgb: "#FFFF00" } });
    expect(styleOf(document, " accent")).toMatchObject({ bl: 1, cl: { rgb: "#00B050" } });
    expect(styleOf(document, "Override")).toEqual({
      fs: 11,
      ff: "Calibri",
      cl: { rgb: "#C00000" },
    });
  });

  it("reads alignment from the style unless the paragraph sets its own", () => {
    expect(paragraphOf(document, "Annual report")?.paragraphStyle).toMatchObject({
      namedStyleType: NamedStyleType.TITLE,
      horizontalAlign: HorizontalAlign.CENTER,
    });
    expect(paragraphOf(document, "Overview")?.paragraphStyle).toMatchObject({
      namedStyleType: NamedStyleType.HEADING_1,
    });
    expect(paragraphOf(document, "Callout text")?.paragraphStyle).toEqual({
      horizontalAlign: HorizontalAlign.CENTER,
    });
    expect(paragraphOf(document, "Override")?.paragraphStyle).toEqual({
      horizontalAlign: HorizontalAlign.RIGHT,
    });
    expect(paragraphOf(document, "Plain")?.paragraphStyle).toBeUndefined();
  });

  it("keeps empty paragraphs, tabs, and split runs as one piece of text", () => {
    expect(document.body?.dataStream).toContain("Callout text\rOverride\r\rBullet\r");
    expect(document.body?.dataStream).toContain("See\tthe docs\r");
    expect(document.body?.textRuns?.filter((run) => run.ts?.fs === 16)).toHaveLength(1);
  });

  it("reads bulleted and numbered lists with nesting", () => {
    expect(
      ["Bullet", "Nested", "Step"].map((text) => {
        const bullet = paragraphOf(document, text)?.bullet;
        return [bullet?.listType, bullet?.nestingLevel];
      }),
    ).toEqual([
      [PresetListType.BULLET_LIST, 0],
      [PresetListType.BULLET_LIST, 1],
      [PresetListType.ORDER_LIST, 0],
    ]);
    expect(paragraphOf(document, "Bullet")?.bullet?.listId).toBe(
      paragraphOf(document, "Nested")?.bullet?.listId,
    );
  });

  it("reads links from the package relationships", () => {
    const start = document.body?.dataStream.indexOf("the docs") ?? -1;
    expect(document.body?.customRanges).toMatchObject([
      {
        startIndex: start,
        endIndex: start + "the docs".length - 1,
        properties: { url: "https://example.com/docs" },
      },
    ]);
  });

  it("reads table column widths and merged cells", () => {
    const [table] = Object.values(document.tableSource ?? {});
    // 3000 and 6000 twips, which fit inside the page's 468pt text width.
    expect(table?.tableColumns.map((column) => column.size.width.v)).toEqual([150, 300]);
    expect(
      table?.tableRows.map((row) => row.tableCells.map((cell) => [cell.rowSpan, cell.columnSpan])),
    ).toEqual([
      [
        [1, 2],
        [0, 0],
      ],
      [
        [2, 1],
        [undefined, undefined],
      ],
      [
        [0, 0],
        [undefined, undefined],
      ],
    ]);
    expect(document.body?.dataStream).toContain("Merged across\r\n");
  });

  it("reads the page size and margins", () => {
    expect(document.documentStyle).toEqual({
      pageSize: { width: 612, height: 792 },
      marginTop: 72,
      marginRight: 72,
      marginBottom: 72,
      marginLeft: 72,
    });
  });
});
