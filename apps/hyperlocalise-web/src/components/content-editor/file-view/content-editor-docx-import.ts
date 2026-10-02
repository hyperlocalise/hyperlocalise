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
  NamedStyleType,
  PresetListType,
  generateRandomId,
  type IDocumentBody,
  type IDocumentData,
  type ITextStyle,
} from "@univerjs/core";
import JSZip from "jszip";

/** Word measures in twentieths of a point; Univer measures documents in points. */
const TWIPS_PER_POINT = 20;
const HALF_POINTS_PER_POINT = 2;
const MAX_STYLE_DEPTH = 20;

type DocumentStyle = IDocumentData["documentStyle"];

/** Run formatting after styles are applied. Unset means "not specified anywhere". */
type RunFormat = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  vertical?: BaselineOffset;
  /** Points. */
  size?: number;
  /** `#RRGGBB`. */
  color?: string;
  /** `#RRGGBB`. */
  background?: string;
  font?: string;
};

type ParagraphFormat = {
  align?: HorizontalAlign;
  /** `null` is an explicit "not a list item", which overrides a list set by a style. */
  list?: { numId: string; level: number } | null;
};

type Style = { run: RunFormat; paragraph: ParagraphFormat; heading?: NamedStyleType };

const EMPTY_STYLE: Style = { run: {}, paragraph: {} };

const ALIGNMENTS: Record<string, HorizontalAlign> = {
  left: HorizontalAlign.LEFT,
  start: HorizontalAlign.LEFT,
  center: HorizontalAlign.CENTER,
  right: HorizontalAlign.RIGHT,
  end: HorizontalAlign.RIGHT,
  both: HorizontalAlign.JUSTIFIED,
  distribute: HorizontalAlign.JUSTIFIED,
};

/** Word's named highlight colours. */
const HIGHLIGHTS: Record<string, string> = {
  yellow: "#FFFF00",
  green: "#00FF00",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  blue: "#0000FF",
  red: "#FF0000",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#C0C0C0",
  black: "#000000",
  white: "#FFFFFF",
};

const HEADINGS = [
  NamedStyleType.HEADING_1,
  NamedStyleType.HEADING_2,
  NamedStyleType.HEADING_3,
  NamedStyleType.HEADING_4,
  NamedStyleType.HEADING_5,
];

// Everything below a space except tab would be read as a Univer stream token.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000a-\u001f]/g;
const SAFE_LINK = /^(https?:|mailto:)/i;

function childrenOf(parent: Element | undefined, name: string): Element[] {
  return parent ? [...parent.children].filter((child) => child.localName === name) : [];
}

function childOf(parent: Element | undefined, name: string): Element | undefined {
  return parent ? [...parent.children].find((child) => child.localName === name) : undefined;
}

function valueOf(parent: Element | undefined, name: string): string | undefined {
  return childOf(parent, name)?.getAttribute("w:val") ?? undefined;
}

/** Reads an on/off property such as `<w:b/>`, where a missing value means on. */
function toggleOf(parent: Element | undefined, name: string): boolean | undefined {
  const element = childOf(parent, name);
  if (!element) {
    return undefined;
  }
  const value = element.getAttribute("w:val");
  return !(value === "0" || value === "false" || value === "off" || value === "none");
}

function hexColor(value: string | null | undefined): string | undefined {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value.toUpperCase()}` : undefined;
}

/** Drops unset keys so that spreading a format never overrides an inherited value. */
function defined<T extends object>(format: T): T {
  return Object.fromEntries(Object.entries(format).filter(([, value]) => value !== undefined)) as T;
}

function readRunFormat(properties: Element | undefined): RunFormat {
  const size = Number(valueOf(properties, "sz"));
  const vertical = valueOf(properties, "vertAlign");
  return defined<RunFormat>({
    bold: toggleOf(properties, "b"),
    italic: toggleOf(properties, "i"),
    underline: toggleOf(properties, "u"),
    strike: toggleOf(properties, "strike"),
    vertical:
      vertical === "superscript"
        ? BaselineOffset.SUPERSCRIPT
        : vertical === "subscript"
          ? BaselineOffset.SUBSCRIPT
          : undefined,
    size: size > 0 ? size / HALF_POINTS_PER_POINT : undefined,
    color: hexColor(valueOf(properties, "color")),
    background:
      HIGHLIGHTS[valueOf(properties, "highlight") ?? ""] ??
      hexColor(childOf(properties, "shd")?.getAttribute("w:fill")),
    font: childOf(properties, "rFonts")?.getAttribute("w:ascii") ?? undefined,
  });
}

function readParagraphFormat(properties: Element | undefined): ParagraphFormat {
  const numbering = childOf(properties, "numPr");
  const numId = valueOf(numbering, "numId");
  return defined<ParagraphFormat>({
    align: ALIGNMENTS[valueOf(properties, "jc") ?? ""],
    list:
      numId === undefined
        ? undefined
        : numId === "0"
          ? null
          : { numId, level: Number(valueOf(numbering, "ilvl") ?? 0) },
  });
}

function headingOf(styleName: string | undefined): NamedStyleType | undefined {
  const name = styleName?.toLowerCase();
  if (name === "title") {
    return NamedStyleType.TITLE;
  }
  const level = /^heading ([1-9])$/.exec(name ?? "")?.[1];
  return level ? HEADINGS[Number(level) - 1] : undefined;
}

/** Resolves Word's style inheritance: document defaults, then the `basedOn` chain. */
function readStyles(root: Element | undefined) {
  const defaults = childOf(root, "docDefaults");
  const base: Style = {
    run: readRunFormat(childOf(childOf(defaults, "rPrDefault"), "rPr")),
    paragraph: readParagraphFormat(childOf(childOf(defaults, "pPrDefault"), "pPr")),
  };
  const elements = new Map(
    childrenOf(root, "style").map((style) => [style.getAttribute("w:styleId") ?? "", style]),
  );
  const resolved = new Map<string, Style>();

  /** A style's own formatting merged over its ancestors', without the document defaults. */
  function resolve(id: string | undefined, depth = 0): Style {
    const element = id === undefined ? undefined : elements.get(id);
    if (!element || id === undefined || depth > MAX_STYLE_DEPTH) {
      return EMPTY_STYLE;
    }
    const cached = resolved.get(id);
    if (cached) {
      return cached;
    }
    const parent = resolve(valueOf(element, "basedOn"), depth + 1);
    const style: Style = {
      run: { ...parent.run, ...readRunFormat(childOf(element, "rPr")) },
      paragraph: { ...parent.paragraph, ...readParagraphFormat(childOf(element, "pPr")) },
      heading: headingOf(valueOf(element, "name")) ?? parent.heading,
    };
    resolved.set(id, style);
    return style;
  }

  const defaultParagraph = [...elements.values()]
    .find(
      (style) =>
        style.getAttribute("w:type") === "paragraph" &&
        ["1", "true", "on"].includes(style.getAttribute("w:default") ?? ""),
    )
    ?.getAttribute("w:styleId");

  return { base, resolve, defaultParagraph: defaultParagraph ?? undefined };
}

/** Returns whether a numbering level counts (1, a, i) rather than using a bullet. */
function readNumbering(root: Element | undefined) {
  const formats = new Map(
    childrenOf(root, "abstractNum").map((abstract) => [
      abstract.getAttribute("w:abstractNumId"),
      new Map(
        childrenOf(abstract, "lvl").map((level) => [
          Number(level.getAttribute("w:ilvl")),
          valueOf(level, "numFmt"),
        ]),
      ),
    ]),
  );
  const abstractIds = new Map(
    childrenOf(root, "num").map((num) => [
      num.getAttribute("w:numId"),
      valueOf(num, "abstractNumId"),
    ]),
  );
  return (numId: string, level: number) => {
    const format = formats.get(abstractIds.get(numId) ?? null)?.get(level);
    return format !== undefined && format !== "bullet" && format !== "none";
  };
}

function readLinkTargets(root: Element | undefined): Map<string, string> {
  return new Map(
    childrenOf(root, "Relationship").flatMap((relationship) => {
      const id = relationship.getAttribute("Id");
      const target = relationship.getAttribute("Target");
      return id && target && SAFE_LINK.test(target) ? [[id, target] as const] : [];
    }),
  );
}

function readPage(section: Element | undefined, defaults: DocumentStyle): DocumentStyle {
  const size = childOf(section, "pgSz");
  const margin = childOf(section, "pgMar");
  const points = (element: Element | undefined, name: string) => {
    const twips = Number(element?.getAttribute(`w:${name}`));
    return twips > 0 ? twips / TWIPS_PER_POINT : undefined;
  };
  const width = points(size, "w");
  const height = points(size, "h");
  return {
    ...defaults,
    ...defined({
      pageSize: width && height ? { width, height } : undefined,
      marginTop: points(margin, "top"),
      marginRight: points(margin, "right"),
      marginBottom: points(margin, "bottom"),
      marginLeft: points(margin, "left"),
    }),
  };
}

function textStyleOf(format: RunFormat, isHeading: boolean): ITextStyle {
  const { TRUE, FALSE } = BooleanNumber;
  return defined<ITextStyle>({
    // Univer draws headings bold unless told otherwise; Word's heading styles often are not.
    bl: format.bold ? TRUE : isHeading ? FALSE : undefined,
    it: format.italic ? TRUE : undefined,
    ul: format.underline ? { s: TRUE } : undefined,
    st: format.strike ? { s: TRUE } : undefined,
    va: format.vertical,
    fs: format.size,
    ff: format.font,
    cl: format.color ? { rgb: format.color } : undefined,
    bg: format.background ? { rgb: format.background } : undefined,
  });
}

type GridCell = { element?: Element; columnSpan: number; rowSpan: number };

/** Lays a Word table out as a full grid, where merged-away positions have zero spans. */
function readTableGrid(table: Element): GridCell[][] {
  const grid: GridCell[][] = [];
  for (const row of childrenOf(table, "tr")) {
    const cells: GridCell[] = [];
    for (const cell of childrenOf(row, "tc")) {
      const properties = childOf(cell, "tcPr");
      const span = Math.max(1, Number(valueOf(properties, "gridSpan") ?? 1));
      const merge = childOf(properties, "vMerge");
      const continuesAbove = merge !== undefined && merge.getAttribute("w:val") !== "restart";
      if (continuesAbove) {
        const column = cells.length;
        const anchorRow = grid.findLast((above) => above[column]?.element);
        if (anchorRow) {
          anchorRow[column].rowSpan += 1;
        }
        cells.push({ columnSpan: 0, rowSpan: 0 });
      } else {
        cells.push({ element: cell, columnSpan: span, rowSpan: 1 });
      }
      for (let covered = 1; covered < span; covered += 1) {
        cells.push({ columnSpan: 0, rowSpan: 0 });
      }
    }
    grid.push(cells);
  }
  const columnCount = Math.max(0, ...grid.map((cells) => cells.length));
  for (const cells of grid) {
    while (cells.length < columnCount) {
      cells.push({ columnSpan: 1, rowSpan: 1 });
    }
  }
  return grid;
}

async function readXml(zip: JSZip, path: string): Promise<Element | undefined> {
  const text = await zip.file(path)?.async("string");
  return text
    ? new DOMParser().parseFromString(text, "application/xml").documentElement
    : undefined;
}

/**
 * Reads a Word file into a Univer document. Formatting is resolved through the file's styles,
 * so text size, colour, and alignment set by a style are kept. Images, headers, footers, and
 * anything not listed in `RunFormat` and `ParagraphFormat` are left out.
 */
export async function readDocxDocument(
  content: ArrayBuffer,
  pageDefaults: DocumentStyle,
): Promise<Pick<IDocumentData, "body" | "tableSource" | "documentStyle">> {
  const zip = await JSZip.loadAsync(content);
  const documentRoot = await readXml(zip, "word/document.xml");
  const bodyElement = childOf(documentRoot, "body");
  if (!bodyElement) {
    throw new Error("This Word file could not be read");
  }
  const styles = readStyles(await readXml(zip, "word/styles.xml"));
  const isOrderedList = readNumbering(await readXml(zip, "word/numbering.xml"));
  const linkTargets = readLinkTargets(await readXml(zip, "word/_rels/document.xml.rels"));
  const { genTableSource } = await import("@univerjs/docs-ui");

  const documentStyle = readPage(childOf(bodyElement, "sectPr"), pageDefaults);
  const textWidth =
    (documentStyle.pageSize?.width ?? 0) -
    (documentStyle.marginLeft ?? 0) -
    (documentStyle.marginRight ?? 0);

  let stream = "";
  const body = {
    paragraphs: [],
    textRuns: [],
    customRanges: [],
    tables: [],
    sectionBreaks: [],
  } satisfies Partial<IDocumentBody> as Required<
    Pick<IDocumentBody, "paragraphs" | "textRuns" | "customRanges" | "tables" | "sectionBreaks">
  >;
  const tableSource: NonNullable<IDocumentData["tableSource"]> = {};

  function endParagraph(format: ParagraphFormat = {}, heading?: NamedStyleType) {
    const list = format.list;
    const ordered = list ? isOrderedList(list.numId, list.level) : false;
    const paragraphStyle = defined({
      namedStyleType: heading,
      headingId: heading === undefined ? undefined : generateRandomId(6),
      horizontalAlign: format.align,
    });
    body.paragraphs.push({
      startIndex: stream.length,
      paragraphId: `para_${generateRandomId(12)}`,
      ...(Object.keys(paragraphStyle).length > 0 ? { paragraphStyle } : {}),
      ...(list
        ? {
            bullet: {
              listType: ordered ? PresetListType.ORDER_LIST : PresetListType.BULLET_LIST,
              // Ordered and bulleted levels of one Word list are separate Univer lists.
              listId: `list-${list.numId}-${ordered ? "ordered" : "bullet"}`,
              nestingLevel: list.level,
            },
          }
        : {}),
    });
    stream += DataStreamTreeTokenType.PARAGRAPH;
  }

  function appendText(text: string, style: ITextStyle, url: string | undefined) {
    if (!text) {
      return;
    }
    const start = stream.length;
    stream += text;
    if (Object.keys(style).length > 0) {
      // Word splits one visual run into many; rejoin neighbours that look the same.
      const previous = body.textRuns.at(-1);
      if (previous?.ed === start && JSON.stringify(previous.ts) === JSON.stringify(style)) {
        previous.ed = stream.length;
      } else {
        body.textRuns.push({ st: start, ed: stream.length, ts: style });
      }
    }
    if (url) {
      const previous = body.customRanges.at(-1);
      if (previous?.endIndex === start - 1 && previous.properties?.url === url) {
        previous.endIndex = stream.length - 1;
      } else {
        body.customRanges.push({
          startIndex: start,
          endIndex: stream.length - 1,
          rangeId: generateRandomId(12),
          rangeType: CustomRangeType.HYPERLINK,
          properties: { url },
        });
      }
    }
  }

  function appendRun(run: Element, inherited: RunFormat, isHeading: boolean, url?: string) {
    const properties = childOf(run, "rPr");
    const format = {
      ...inherited,
      ...styles.resolve(valueOf(properties, "rStyle")).run,
      ...readRunFormat(properties),
    };
    let text = "";
    for (const node of run.children) {
      if (node.localName === "t") {
        text += (node.textContent ?? "").replace(CONTROL_CHARACTERS, "");
      } else if (node.localName === "tab") {
        text += DataStreamTreeTokenType.TAB;
      } else if (node.localName === "br" && !node.getAttribute("w:type")) {
        // A line break inside a paragraph has no Univer equivalent here.
        text += " ";
      } else if (node.localName === "noBreakHyphen") {
        text += "‑";
      }
    }
    appendText(text, textStyleOf(format, isHeading), url);
  }

  function appendInline(parent: Element, inherited: RunFormat, isHeading: boolean, url?: string) {
    for (const node of parent.children) {
      switch (node.localName) {
        case "r":
          appendRun(node, inherited, isHeading, url);
          break;
        case "hyperlink":
          appendInline(
            node,
            inherited,
            isHeading,
            linkTargets.get(node.getAttribute("r:id") ?? "") ?? url,
          );
          break;
        case "sdt":
          appendInline(childOf(node, "sdtContent") ?? node, inherited, isHeading, url);
          break;
        // Tracked insertions and other wrappers hold ordinary runs. Deletions are skipped.
        case "ins":
        case "smartTag":
        case "fldSimple":
          appendInline(node, inherited, isHeading, url);
          break;
      }
    }
  }

  function appendParagraph(paragraph: Element) {
    const properties = childOf(paragraph, "pPr");
    const style = styles.resolve(valueOf(properties, "pStyle") ?? styles.defaultParagraph);
    appendInline(paragraph, { ...styles.base.run, ...style.run }, style.heading !== undefined);
    endParagraph(
      { ...styles.base.paragraph, ...style.paragraph, ...readParagraphFormat(properties) },
      style.heading,
    );
  }

  function appendTable(table: Element) {
    const grid = readTableGrid(table);
    const columnCount = grid[0]?.length ?? 0;
    if (columnCount === 0) {
      return;
    }
    // Univer needs a paragraph before every table.
    if (!stream.endsWith(DataStreamTreeTokenType.PARAGRAPH)) {
      endParagraph();
    }

    const source = genTableSource(grid.length, columnCount, textWidth);
    const widths = childrenOf(childOf(table, "tblGrid"), "gridCol").map(
      (column) => Number(column.getAttribute("w:w")) / TWIPS_PER_POINT,
    );
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (widths.length === columnCount && widths.every((width) => width > 0)) {
      // Keep the column proportions, but never let a table run past the text area.
      const scale = Math.min(1, textWidth / total);
      source.tableColumns.forEach((column, index) => {
        column.size.width.v = widths[index] * scale;
      });
      source.size.width.v = total * scale;
    }
    tableSource[source.tableId] = source;

    const startIndex = stream.length;
    stream += DataStreamTreeTokenType.TABLE_START;
    grid.forEach((cells, rowIndex) => {
      stream += DataStreamTreeTokenType.TABLE_ROW_START;
      cells.forEach((cell, columnIndex) => {
        if (cell.rowSpan !== 1 || cell.columnSpan !== 1) {
          Object.assign(source.tableRows[rowIndex].tableCells[columnIndex], {
            rowSpan: cell.rowSpan,
            columnSpan: cell.columnSpan,
          });
        }
        stream += DataStreamTreeTokenType.TABLE_CELL_START;
        if (cell.element) {
          appendBlocks(cell.element);
        }
        // Every cell ends with a paragraph and its own section break.
        if (!stream.endsWith(DataStreamTreeTokenType.PARAGRAPH)) {
          endParagraph();
        }
        endSection();
        stream += DataStreamTreeTokenType.TABLE_CELL_END;
      });
      stream += DataStreamTreeTokenType.TABLE_ROW_END;
    });
    stream += DataStreamTreeTokenType.TABLE_END;
    body.tables.push({ startIndex, endIndex: stream.length, tableId: source.tableId });
  }

  function appendBlocks(container: Element) {
    for (const node of container.children) {
      if (node.localName === "p") {
        appendParagraph(node);
      } else if (node.localName === "tbl") {
        appendTable(node);
      } else if (node.localName === "sdt") {
        appendBlocks(childOf(node, "sdtContent") ?? node);
      }
    }
  }

  function endSection() {
    body.sectionBreaks.push({
      sectionId: `section_${generateRandomId(12)}`,
      startIndex: stream.length,
    });
    stream += DataStreamTreeTokenType.SECTION_BREAK;
  }

  appendBlocks(bodyElement);
  if (!stream.endsWith(DataStreamTreeTokenType.PARAGRAPH)) {
    endParagraph();
  }
  endSection();

  return { body: { dataStream: stream, ...body }, tableSource, documentStyle };
}
