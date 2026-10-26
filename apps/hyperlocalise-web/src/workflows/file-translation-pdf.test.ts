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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

const { readTranslatedFileMock, pdfApplyMock } = vi.hoisted(() => ({
  readTranslatedFileMock: vi.fn(),
  pdfApplyMock: vi.fn(),
}));

vi.mock("@/lib/translation/sandbox", () => ({
  readTranslatedFile: readTranslatedFileMock,
}));

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({ pdf: { apply: pdfApplyMock } }),
}));

import {
  parsePdfHlOutputValues,
  pdfHlSourceContent,
  pdfHlSourceFilename,
  renderPdfTranslationStep,
} from "./file-translation-pdf";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pdfHlSourceFilename", () => {
  it("swaps the .pdf extension for .json", () => {
    expect(pdfHlSourceFilename("Brochure_2026.pdf")).toBe("Brochure_2026.json");
    expect(pdfHlSourceFilename("SCAN.PDF")).toBe("SCAN.json");
  });

  it("appends .json when the name has no .pdf extension", () => {
    expect(pdfHlSourceFilename("brochure")).toBe("brochure.json");
  });
});

describe("pdfHlSourceContent", () => {
  it("round-trips positional block keys unchanged", () => {
    const sourceEntries = {
      "page-1#1": "Annual report",
      "page-1#2": "Revenue grew 12%.",
      "page-12#30": 'Quotes "and" unicode — ✓',
    };
    expect(parsePdfHlOutputValues(pdfHlSourceContent(sourceEntries))).toEqual(sourceEntries);
  });
});

describe("parsePdfHlOutputValues", () => {
  it("rejects non-string values", () => {
    expect(() => parsePdfHlOutputValues(Buffer.from('{"page-1#1":{"a":"b"}}'))).toThrow();
  });
});

describe("renderPdfTranslationStep", () => {
  const template = Buffer.from("%PDF-1.7 template");
  const input = {
    sandboxId: "sbx_pdf",
    valuesFilename: "brochure-fr-FR.json",
    template,
    targetLocale: "fr-FR",
  };

  beforeEach(() => {
    readTranslatedFileMock.mockResolvedValue(
      Buffer.from(JSON.stringify({ "page-1#1": "Rapport annuel" })),
    );
  });

  it("renders the hl JSON output into the source PDF", async () => {
    pdfApplyMock.mockResolvedValue({
      content: new Uint8Array([1, 2, 3]),
      overflowKeys: ["page-1#1"],
    });

    await expect(renderPdfTranslationStep(input)).resolves.toEqual({
      ok: true,
      content: Buffer.from([1, 2, 3]),
      overflowKeyCount: 1,
    });
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sbx_pdf", "brochure-fr-FR.json");
    expect(pdfApplyMock).toHaveBeenCalledWith({
      template,
      values: { "page-1#1": "Rapport annuel" },
      targetLocale: "fr-FR",
    });
  });

  it("returns pdf_script_unsupported for unsupported target scripts", async () => {
    pdfApplyMock.mockRejectedValue(
      new GoSvcClientError({ code: "pdf_script_unsupported", message: "nope", status: 422 }),
    );

    await expect(renderPdfTranslationStep(input)).resolves.toEqual({
      ok: false,
      code: "pdf_script_unsupported",
    });
  });

  it("returns pdf_render_failed for other go-svc rejections", async () => {
    pdfApplyMock.mockRejectedValue(
      new GoSvcClientError({ code: "pdf_invalid", message: "bad", status: 422 }),
    );

    await expect(renderPdfTranslationStep(input)).resolves.toEqual({
      ok: false,
      code: "pdf_render_failed",
    });
  });

  it("throws on server errors so the step retries", async () => {
    pdfApplyMock.mockRejectedValue(
      new GoSvcClientError({ code: "pdf_export_failed", message: "boom", status: 500 }),
    );

    await expect(renderPdfTranslationStep(input)).rejects.toThrow("boom");
  });
});
