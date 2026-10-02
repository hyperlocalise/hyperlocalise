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
import {
  BaselineOffset,
  BooleanNumber,
  CustomRangeType,
  DataStreamTreeTokenType,
  HorizontalAlign,
  NAMED_STYLE_MAP,
  NamedStyleType,
  type IBullet,
  type IDocumentData,
  type ITextStyle,
} from "@univerjs/core";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

/** Univer measures documents in points; Word measures in twentieths of a point. */
const TWIPS_PER_POINT = 20;
const HALF_POINTS_PER_POINT = 2;
const ORDERED_LIST = "ordered";
const LIST_LEVELS = 9;
const LIST_INDENT = 720;
const LIST_HANGING = 360;
const LIST_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];

const HEADINGS: Partial<Record<NamedStyleType, (typeof HeadingLevel)[keyof typeof HeadingLevel]>> =
  {
    [NamedStyleType.TITLE]: HeadingLevel.TITLE,
    [NamedStyleType.HEADING_1]: HeadingLevel.HEADING_1,
    [NamedStyleType.HEADING_2]: HeadingLevel.HEADING_2,
    [NamedStyleType.HEADING_3]: HeadingLevel.HEADING_3,
    [NamedStyleType.HEADING_4]: HeadingLevel.HEADING_4,
    [NamedStyleType.HEADING_5]: HeadingLevel.HEADING_5,
  };

const ALIGNMENTS: Partial<
  Record<HorizontalAlign, (typeof AlignmentType)[keyof typeof AlignmentType]>
> = {
  [HorizontalAlign.LEFT]: AlignmentType.LEFT,
  [HorizontalAlign.CENTER]: AlignmentType.CENTER,
  [HorizontalAlign.RIGHT]: AlignmentType.RIGHT,
  [HorizontalAlign.JUSTIFIED]: AlignmentType.BOTH,
  [HorizontalAlign.BOTH]: AlignmentType.BOTH,
  [HorizontalAlign.DISTRIBUTED]: AlignmentType.DISTRIBUTE,
};

/** A paragraph or table, as character ranges of the document's data stream. */
type DocumentBlock =
  | { kind: "paragraph"; start: number; end: number }
  | { kind: "table"; start: number; rows: DocumentBlock[][][] };

type Cursor = { position: number };

const {
  PARAGRAPH,
  TAB,
  TABLE_START,
  TABLE_ROW_START,
  TABLE_ROW_END,
  TABLE_CELL_START,
  TABLE_CELL_END,
  TABLE_END,
} = DataStreamTreeTokenType;

/** Stream tokens that mark structure this writer does not carry over, such as section ends. */
const SKIPPED_TOKENS = new Set<string>([
  DataStreamTreeTokenType.SECTION_BREAK,
  DataStreamTreeTokenType.DOCS_END,
  DataStreamTreeTokenType.BLOCK_START,
  DataStreamTreeTokenType.BLOCK_END,
  DataStreamTreeTokenType.COLUMN_GROUP_START,
  DataStreamTreeTokenType.COLUMN_GROUP_END,
  DataStreamTreeTokenType.COLUMN_START,
  DataStreamTreeTokenType.COLUMN_END,
  TABLE_ROW_START,
  TABLE_ROW_END,
  TABLE_CELL_START,
  TABLE_CELL_END,
  TABLE_END,
]);

// Everything below a space except tab is a stream token, not text.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000a-\u001f]/g;

function readParagraph(stream: string, cursor: Cursor, until?: string): DocumentBlock {
  const start = cursor.position;
  while (
    cursor.position < stream.length &&
    stream[cursor.position] !== PARAGRAPH &&
    stream[cursor.position] !== until
  ) {
    cursor.position += 1;
  }
  const end = cursor.position;
  if (stream[cursor.position] === PARAGRAPH) {
    cursor.position += 1;
  }
  return { kind: "paragraph", start, end };
}

function readTable(stream: string, cursor: Cursor): DocumentBlock {
  const start = cursor.position;
  cursor.position += 1;
  const rows: DocumentBlock[][][] = [];
  while (stream[cursor.position] === TABLE_ROW_START) {
    cursor.position += 1;
    const cells: DocumentBlock[][] = [];
    while (stream[cursor.position] === TABLE_CELL_START) {
      cursor.position += 1;
      cells.push(readBlocks(stream, cursor, TABLE_CELL_END));
      cursor.position += 1;
    }
    if (stream[cursor.position] === TABLE_ROW_END) {
      cursor.position += 1;
    }
    rows.push(cells);
  }
  if (stream[cursor.position] === TABLE_END) {
    cursor.position += 1;
  }
  return { kind: "table", start, rows };
}

function readBlocks(stream: string, cursor: Cursor, until?: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  while (cursor.position < stream.length && stream[cursor.position] !== until) {
    const token = stream[cursor.position];
    if (token === TABLE_START) {
      blocks.push(readTable(stream, cursor));
    } else if (SKIPPED_TOKENS.has(token)) {
      cursor.position += 1;
    } else {
      blocks.push(readParagraph(stream, cursor, until));
    }
  }
  return blocks;
}

/** Unset stays unset so the paragraph's style decides; only an explicit 0 turns a format off. */
function flag(value: BooleanNumber | undefined): boolean | undefined {
  return value === undefined ? undefined : value === BooleanNumber.TRUE;
}

/** Univer colours are `#RRGGBB` or `rgb(r, g, b)`; Word wants `RRGGBB`. */
function wordColor(color: ITextStyle["cl"]): string | undefined {
  const rgb = color?.rgb;
  if (!rgb) {
    return undefined;
  }
  const hex = /^#?([0-9a-f]{6})$/i.exec(rgb)?.[1];
  if (hex) {
    return hex.toUpperCase();
  }
  const channels = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb)?.slice(1, 4);
  return channels
    ?.map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function textRun(text: string, style: ITextStyle | undefined): TextRun {
  const fill = wordColor(style?.bg);
  return new TextRun({
    // Word needs a tab element; a tab character inside text is not a tab stop.
    children: text.split(TAB).flatMap((part, index) => (index === 0 ? [part] : [new Tab(), part])),
    bold: flag(style?.bl),
    italics: flag(style?.it),
    underline: style?.ul?.s === BooleanNumber.TRUE ? {} : undefined,
    strike: flag(style?.st?.s),
    subScript: style?.va === BaselineOffset.SUBSCRIPT || undefined,
    superScript: style?.va === BaselineOffset.SUPERSCRIPT || undefined,
    size: style?.fs ? Math.round(style.fs * HALF_POINTS_PER_POINT) : undefined,
    font: style?.ff ?? undefined,
    color: wordColor(style?.cl),
    shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
  });
}

/** A Word style that matches how Univer draws a heading, so it looks the same in both. */
function headingStyle(type: NamedStyleType) {
  const style = NAMED_STYLE_MAP[type];
  return {
    run: {
      size: style?.fs ? style.fs * HALF_POINTS_PER_POINT : undefined,
      bold: flag(style?.bl),
    },
  };
}

function pageProperties({
  pageSize,
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
}: IDocumentData["documentStyle"]) {
  const twips = (points: number | undefined) =>
    points === undefined ? undefined : Math.round(points * TWIPS_PER_POINT);
  return {
    size:
      pageSize?.width && pageSize.height
        ? { width: twips(pageSize.width), height: twips(pageSize.height) }
        : undefined,
    margin: {
      top: twips(marginTop),
      right: twips(marginRight),
      bottom: twips(marginBottom),
      left: twips(marginLeft),
    },
  };
}

/**
 * Writes a Univer document as a Word file. It carries what the docx import brings in: headings,
 * alignment, text size, colour, highlight, font, bold, italic, underline, strikethrough, sub and
 * superscript, lists, links, and tables. Other formatting is not written.
 */
export async function exportDocumentToDocx(data: IDocumentData): Promise<Blob> {
  const stream = data.body?.dataStream ?? "";
  const textRuns = data.body?.textRuns ?? [];
  const paragraphs = new Map(
    (data.body?.paragraphs ?? []).map((paragraph) => [paragraph.startIndex, paragraph]),
  );
  const tableIds = new Map(
    (data.body?.tables ?? []).map((table) => [table.startIndex, table.tableId]),
  );
  const links = (data.body?.customRanges ?? []).flatMap((range) => {
    const url: unknown = range.properties?.url;
    return range.rangeType === CustomRangeType.HYPERLINK && typeof url === "string"
      ? [{ start: range.startIndex, end: range.endIndex + 1, url }]
      : [];
  });
  // Each Univer list is its own numbering instance, so separate ordered lists restart at 1.
  const listInstances = new Map<string, number>();

  function listOptions(bullet: IBullet | undefined) {
    if (!bullet) {
      return {};
    }
    const level = Math.min(Math.max(bullet.nestingLevel, 0), LIST_LEVELS - 1);
    if (!bullet.listType.startsWith("ORDER")) {
      return { bullet: { level } };
    }
    if (!listInstances.has(bullet.listId)) {
      listInstances.set(bullet.listId, listInstances.size);
    }
    const instance = listInstances.get(bullet.listId);
    return { numbering: { reference: ORDERED_LIST, level, instance } };
  }

  function buildRuns(start: number, end: number): (TextRun | ExternalHyperlink)[] {
    const cuts = new Set([start, end]);
    for (const { st, ed } of textRuns) {
      cuts.add(st).add(ed);
    }
    for (const link of links) {
      cuts.add(link.start).add(link.end);
    }
    const bounds = [...cuts].filter((cut) => cut >= start && cut <= end).sort((a, b) => a - b);

    const children: (TextRun | ExternalHyperlink)[] = [];
    let openLink: { url: string; runs: TextRun[] } | undefined;
    for (let index = 0; index + 1 < bounds.length; index += 1) {
      const from = bounds[index];
      const to = bounds[index + 1];
      const text = stream.slice(from, to).replace(CONTROL_CHARACTERS, "");
      const link = links.find((candidate) => candidate.start <= from && to <= candidate.end);
      if (openLink && openLink.url !== link?.url) {
        children.push(new ExternalHyperlink({ link: openLink.url, children: openLink.runs }));
        openLink = undefined;
      }
      if (!text) {
        continue;
      }
      const style = textRuns.find((run) => run.st <= from && to <= run.ed)?.ts;
      const run = textRun(text, style);
      if (link) {
        openLink ??= { url: link.url, runs: [] };
        openLink.runs.push(run);
      } else {
        children.push(run);
      }
    }
    if (openLink) {
      children.push(new ExternalHyperlink({ link: openLink.url, children: openLink.runs }));
    }
    return children;
  }

  function buildBlocks(blocks: DocumentBlock[]): (Paragraph | Table)[] {
    return blocks.map((block) => {
      if (block.kind === "paragraph") {
        const paragraph = paragraphs.get(block.end);
        const style = paragraph?.paragraphStyle;
        return new Paragraph({
          children: buildRuns(block.start, block.end),
          heading: HEADINGS[style?.namedStyleType ?? NamedStyleType.NORMAL_TEXT],
          alignment: ALIGNMENTS[style?.horizontalAlign ?? HorizontalAlign.UNSPECIFIED],
          ...listOptions(paragraph?.bullet),
        });
      }

      const source = data.tableSource?.[tableIds.get(block.start) ?? ""];
      const columnWidths = source?.tableColumns.map((column) =>
        Math.round(column.size.width.v * TWIPS_PER_POINT),
      );
      return new Table({
        columnWidths,
        width: columnWidths && {
          size: columnWidths.reduce((total, width) => total + width, 0),
          type: WidthType.DXA,
        },
        rows: block.rows.map(
          (cells, rowIndex) =>
            new TableRow({
              children: cells.flatMap((cellBlocks, columnIndex) => {
                const cell = source?.tableRows[rowIndex]?.tableCells[columnIndex];
                // Univer keeps a cell with zero spans for each position a merged cell covers.
                if (cell?.rowSpan === 0 || cell?.columnSpan === 0) {
                  return [];
                }
                const children = buildBlocks(cellBlocks);
                return [
                  new TableCell({
                    children: children.length > 0 ? children : [new Paragraph({})],
                    columnSpan: cell?.columnSpan,
                    rowSpan: cell?.rowSpan,
                  }),
                ];
              }),
            }),
        ),
      });
    });
  }

  const children = buildBlocks(readBlocks(stream, { position: 0 }));
  const document = new Document({
    styles: {
      default: {
        title: headingStyle(NamedStyleType.TITLE),
        heading1: headingStyle(NamedStyleType.HEADING_1),
        heading2: headingStyle(NamedStyleType.HEADING_2),
        heading3: headingStyle(NamedStyleType.HEADING_3),
        heading4: headingStyle(NamedStyleType.HEADING_4),
        heading5: headingStyle(NamedStyleType.HEADING_5),
      },
    },
    numbering: {
      config: [
        {
          reference: ORDERED_LIST,
          levels: Array.from({ length: LIST_LEVELS }, (_, level) => ({
            level,
            format: LIST_FORMATS[level % LIST_FORMATS.length],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: LIST_HANGING } },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: { page: pageProperties(data.documentStyle) },
        children: children.length > 0 ? children : [new Paragraph({})],
      },
    ],
  });
  return Packer.toBlob(document);
}
