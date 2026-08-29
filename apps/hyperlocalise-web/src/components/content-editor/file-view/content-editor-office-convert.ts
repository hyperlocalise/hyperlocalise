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
import { BuildTextUtils, LocaleType, type IDocumentData, type IWorkbookData } from "@univerjs/core";
import { PageElementType, PageType, type ISlideData } from "@univerjs/slides";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import mammoth from "mammoth";
import PptxGenJS from "pptxgenjs";

import {
  officeExtensionForViewer,
  officeMimeTypeForViewer,
} from "@/components/content-editor/file-view/content-editor-office-mime";

export type ContentEditorOfficeKind = "docx" | "xlsx" | "pptx";

export type ContentEditorOfficeSnapshot =
  | { kind: "docx"; data: IDocumentData }
  | { kind: "xlsx"; data: IWorkbookData }
  | { kind: "pptx"; data: ISlideData };

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Decode common XML text entities. `&amp;` must be last to avoid double-unescaping. */
export function decodeXmlTextEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView | Iterable<number>): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return Uint8Array.from(value);
}

function toArrayBuffer(value: ArrayBuffer | ArrayBufferView | Iterable<number>): ArrayBuffer {
  const bytes = toUint8Array(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function emptyDocumentData(title: string): IDocumentData {
  const body = BuildTextUtils.transform.fromPlainText("");
  return {
    id: randomId("doc"),
    title,
    body: {
      ...body,
      dataStream: `${body.dataStream.endsWith("\r\n") ? body.dataStream : `${body.dataStream}\r\n`}`,
    },
    documentStyle: {
      pageSize: { width: 595.3, height: 841.9 },
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 90,
      marginRight: 90,
    },
  };
}

function documentFromPlainText(title: string, text: string): IDocumentData {
  const body = BuildTextUtils.transform.fromPlainText(text.trim() ? text : "");
  const dataStream = body.dataStream.endsWith("\r\n") ? body.dataStream : `${body.dataStream}\r\n`;
  return {
    ...emptyDocumentData(title),
    body: {
      ...body,
      dataStream,
    },
  };
}

function emptySlideData(title: string): ISlideData {
  const pageId = randomId("slide");
  const elementId = randomId("text");
  return {
    id: randomId("deck"),
    title,
    pageSize: { width: 960, height: 540 },
    body: {
      pageOrder: [pageId],
      pages: {
        [pageId]: {
          id: pageId,
          pageType: PageType.SLIDE,
          zIndex: 1,
          title: "Slide 1",
          description: "",
          pageBackgroundFill: { rgb: "#FFFFFF" },
          pageElements: {
            [elementId]: {
              id: elementId,
              zIndex: 1,
              left: 80,
              top: 160,
              width: 800,
              height: 200,
              title: "Title",
              description: "",
              type: PageElementType.TEXT,
              richText: {
                text: title || "Untitled presentation",
              },
            },
          },
        },
      },
    },
  };
}

function slideDataFromTexts(title: string, slideTexts: string[]): ISlideData {
  const texts = slideTexts.length > 0 ? slideTexts : [title || "Untitled presentation"];
  const pageOrder: string[] = [];
  const pages: NonNullable<ISlideData["body"]>["pages"] = {};

  texts.forEach((slideText, index) => {
    const pageId = randomId(`slide-${index}`);
    const elementId = randomId(`text-${index}`);
    pageOrder.push(pageId);
    pages[pageId] = {
      id: pageId,
      pageType: PageType.SLIDE,
      zIndex: index + 1,
      title: `Slide ${index + 1}`,
      description: "",
      pageBackgroundFill: { rgb: "#FFFFFF" },
      pageElements: {
        [elementId]: {
          id: elementId,
          zIndex: 1,
          left: 80,
          top: 120,
          width: 800,
          height: 320,
          title: `Content ${index + 1}`,
          description: "",
          type: PageElementType.TEXT,
          richText: {
            text: slideText,
          },
        },
      },
    };
  });

  return {
    id: randomId("deck"),
    title,
    pageSize: { width: 960, height: 540 },
    body: { pageOrder, pages },
  };
}

async function fetchAssetFile(src: string, filename: string): Promise<File> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to load office asset (${response.status})`);
  }
  const blob = await response.blob();
  return new File([blob], filename, {
    type: blob.type || "application/octet-stream",
  });
}

async function importXlsxFile(file: File): Promise<IWorkbookData> {
  const { default: LuckyExcel } = await import("@inno76/univer-import-export");
  return await new Promise<IWorkbookData>((resolve, reject) => {
    void LuckyExcel.transformExcelToUniver(
      file,
      (workbook) => {
        resolve(workbook);
      },
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function importDocxFile(file: File, title: string): Promise<IDocumentData> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return documentFromPlainText(title, result.value || "");
}

async function importPptxFile(file: File, title: string): Promise<ISlideData> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .toSorted((a, b) => {
      const aNum = Number(a.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      const bNum = Number(b.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      return aNum - bNum;
    });

  const slideTexts: string[] = [];
  for (const slidePath of slidePaths) {
    const xml = await zip.file(slidePath)?.async("string");
    if (!xml) {
      continue;
    }
    const matches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
    const text = matches
      .map((match) => decodeXmlTextEntities(match[1]).trim())
      .filter(Boolean)
      .join("\n");
    slideTexts.push(text || `Slide ${slideTexts.length + 1}`);
  }

  return slideDataFromTexts(title, slideTexts);
}

export async function loadOfficeSnapshotFromUrl(input: {
  kind: ContentEditorOfficeKind;
  src: string;
  filename: string;
}): Promise<ContentEditorOfficeSnapshot> {
  const file = await fetchAssetFile(input.src, input.filename);
  return loadOfficeSnapshotFromFile({ kind: input.kind, file, title: input.filename });
}

export async function loadOfficeSnapshotFromFile(input: {
  kind: ContentEditorOfficeKind;
  file: File;
  title?: string;
}): Promise<ContentEditorOfficeSnapshot> {
  const title = input.title ?? input.file.name;
  switch (input.kind) {
    case "docx":
      return { kind: "docx", data: await importDocxFile(input.file, title) };
    case "xlsx":
      return { kind: "xlsx", data: await importXlsxFile(input.file) };
    case "pptx":
      return { kind: "pptx", data: await importPptxFile(input.file, title) };
  }
}

export function emptyOfficeSnapshot(
  kind: ContentEditorOfficeKind,
  title: string,
): ContentEditorOfficeSnapshot {
  switch (kind) {
    case "docx":
      return { kind, data: emptyDocumentData(title) };
    case "xlsx":
      return {
        kind,
        data: {
          id: randomId("book"),
          name: title,
          appVersion: "hyperlocalise",
          locale: LocaleType.EN_US,
          styles: {},
          sheetOrder: ["sheet-1"],
          sheets: {
            "sheet-1": {
              id: "sheet-1",
              name: "Sheet1",
              rowCount: 100,
              columnCount: 20,
              cellData: {},
            },
          },
        },
      };
    case "pptx":
      return { kind, data: emptySlideData(title) };
  }
}

function plainTextFromDocument(data: IDocumentData): string {
  const dataStream = data.body?.dataStream ?? "";
  return BuildTextUtils.transform.getPlainText(dataStream);
}

function plainTextsFromSlide(data: ISlideData): string[] {
  const body = data.body;
  if (!body) {
    return [];
  }
  return body.pageOrder.map((pageId) => {
    const page = body.pages[pageId];
    if (!page) {
      return "";
    }
    return Object.values(page.pageElements)
      .map((element) => element.richText?.text?.trim() || element.shape?.text?.trim() || "")
      .filter(Boolean)
      .join("\n");
  });
}

export async function exportOfficeSnapshotToFile(input: {
  snapshot: ContentEditorOfficeSnapshot;
  filename: string;
}): Promise<File> {
  const kind = input.snapshot.kind;
  const extension = officeExtensionForViewer(kind);
  const baseName = input.filename.replace(/\.[^.]+$/, "") || "translated";
  const filename = `${baseName}${extension}`;
  const mimeType = officeMimeTypeForViewer(kind);

  if (kind === "xlsx") {
    const { default: LuckyExcel } = await import("@inno76/univer-import-export");
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      void LuckyExcel.transformUniverToExcel({
        snapshot: input.snapshot.data,
        fileName: filename,
        getBuffer: true,
        success: (value) => {
          if (!value) {
            reject(new Error("Excel export produced an empty buffer"));
            return;
          }
          resolve(toUint8Array(value));
        },
        error: (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      });
    });
    return new File([toArrayBuffer(bytes)], filename, { type: mimeType });
  }

  if (kind === "docx") {
    const text = plainTextFromDocument(input.snapshot.data);
    const paragraphs = (text || "").split(/\n/).map(
      (line) =>
        new Paragraph({
          children: [new TextRun(line)],
        }),
    );
    const document = new Document({
      sections: [
        {
          children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [] })],
        },
      ],
    });
    const buffer = await Packer.toBuffer(document);
    return new File([toArrayBuffer(buffer)], filename, { type: mimeType });
  }

  const pptx = new PptxGenJS();
  const slides = plainTextsFromSlide(input.snapshot.data);
  for (const slideText of slides.length > 0 ? slides : [""]) {
    const slide = pptx.addSlide();
    slide.addText(slideText || " ", {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 4,
      fontSize: 18,
      color: "111827",
    });
  }
  const output = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return new File([output], filename, { type: mimeType });
}
