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
import { Document, Packer, Paragraph, TextRun } from "docx";
import { http, HttpResponse } from "msw";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";

export const CAT_STORY_OFFICE_DOCX_SOURCE_URL = "/storybook/cat/docs/product-brief.source.docx";
export const CAT_STORY_OFFICE_DOCX_TARGET_URL = "/storybook/cat/docs/product-brief.target.docx";
export const CAT_STORY_OFFICE_XLSX_SOURCE_URL =
  "/storybook/cat/sheets/localization-metrics.source.xlsx";
export const CAT_STORY_OFFICE_XLSX_TARGET_URL =
  "/storybook/cat/sheets/localization-metrics.target.xlsx";
export const CAT_STORY_OFFICE_PPTX_SOURCE_URL = "/storybook/cat/decks/quarterly-review.source.pptx";
export const CAT_STORY_OFFICE_PPTX_TARGET_URL = "/storybook/cat/decks/quarterly-review.target.pptx";

export function isCatStoryOfficeAssetUrl(src: string | null | undefined) {
  return Boolean(src?.startsWith("/storybook/cat/"));
}

async function buildStoryDocx(paragraphs: string[]) {
  const document = new Document({
    sections: [
      {
        children: paragraphs.map(
          (line) =>
            new Paragraph({
              children: [new TextRun(line)],
            }),
        ),
      },
    ],
  });
  const buffer = await Packer.toBuffer(document);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function buildStoryXlsx(rows: string[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Metrics");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

async function buildStoryPptx(slides: { title: string; body: string }[]) {
  const pptx = new PptxGenJS();
  for (const slide of slides) {
    const page = pptx.addSlide();
    page.addText(slide.title, { x: 0.5, y: 0.6, w: 9, h: 1, fontSize: 28, bold: true });
    page.addText(slide.body, { x: 0.5, y: 1.8, w: 9, h: 3, fontSize: 18 });
  }
  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}

let sourceDocxPromise: Promise<ArrayBuffer> | null = null;
let targetDocxPromise: Promise<ArrayBuffer> | null = null;
let sourceXlsxPromise: Promise<ArrayBuffer> | null = null;
let targetXlsxPromise: Promise<ArrayBuffer> | null = null;
let sourcePptxPromise: Promise<ArrayBuffer> | null = null;
let targetPptxPromise: Promise<ArrayBuffer> | null = null;

function getSourceDocx() {
  sourceDocxPromise ??= buildStoryDocx([
    "Product brief",
    "Hyperlocalise helps teams review translations in one workspace.",
    "This brief summarizes the dashboard onboarding flow for reviewers.",
  ]);
  return sourceDocxPromise;
}

function getTargetDocx() {
  targetDocxPromise ??= buildStoryDocx([
    "Tóm tắt sản phẩm",
    "Hyperlocalise giúp các nhóm xem xét bản dịch trong một không gian làm việc.",
    "Bản tóm tắt này mô tả luồng onboarding bảng điều khiển cho người duyệt.",
  ]);
  return targetDocxPromise;
}

function getSourceXlsx() {
  sourceXlsxPromise ??= Promise.resolve(
    buildStoryXlsx([
      ["Metric", "Q1"],
      ["Strings reviewed", "1,248"],
      ["Files localized", "36"],
      ["Average review time", "2.4 days"],
    ]),
  );
  return sourceXlsxPromise;
}

function getTargetXlsx() {
  targetXlsxPromise ??= Promise.resolve(
    buildStoryXlsx([
      ["Chỉ số", "Q1"],
      ["Chuỗi đã duyệt", "1.248"],
      ["Tệp đã bản địa hóa", "36"],
      ["Thời gian duyệt trung bình", "2,4 ngày"],
    ]),
  );
  return targetXlsxPromise;
}

function getSourcePptx() {
  sourcePptxPromise ??= buildStoryPptx([
    {
      title: "Localization progress",
      body: "Q1 review for customer-facing strings and assets.",
    },
    {
      title: "Next steps",
      body: "Ship Vietnamese dashboard copy after review.",
    },
  ]);
  return sourcePptxPromise;
}

function getTargetPptx() {
  targetPptxPromise ??= buildStoryPptx([
    {
      title: "Tiến độ bản địa hóa",
      body: "Rà soát Q1 cho chuỗi và tài sản hướng tới khách hàng.",
    },
    {
      title: "Bước tiếp theo",
      body: "Phát hành bản copy bảng điều khiển tiếng Việt sau khi duyệt.",
    },
  ]);
  return targetPptxPromise;
}

function officeResponse(buffer: ArrayBuffer, contentType: string) {
  return new HttpResponse(buffer, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
}

export const contentEditorOfficeMswHandlers = [
  http.get(CAT_STORY_OFFICE_DOCX_SOURCE_URL, async () =>
    officeResponse(
      await getSourceDocx(),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  ),
  http.get(CAT_STORY_OFFICE_DOCX_TARGET_URL, async () =>
    officeResponse(
      await getTargetDocx(),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  ),
  http.get(CAT_STORY_OFFICE_XLSX_SOURCE_URL, async () =>
    officeResponse(
      await getSourceXlsx(),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  ),
  http.get(CAT_STORY_OFFICE_XLSX_TARGET_URL, async () =>
    officeResponse(
      await getTargetXlsx(),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  ),
  http.get(CAT_STORY_OFFICE_PPTX_SOURCE_URL, async () =>
    officeResponse(
      await getSourcePptx(),
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
  ),
  http.get(CAT_STORY_OFFICE_PPTX_TARGET_URL, async () =>
    officeResponse(
      await getTargetPptx(),
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
  ),
];
