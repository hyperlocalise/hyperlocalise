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
import { z } from "zod";

const PDF_EXTENSION = /\.pdf$/i;

const pdfHlOutputSchema = z.record(z.string(), z.string());

/**
 * PDF block keys (`page-N#M`) are positions in the layout. Re-extracting a
 * translated PDF renumbers them, so `hl run` translates a flat JSON copy of the
 * source entries and the PDF is rendered from the JSON output afterwards.
 */
export function pdfHlSourceFilename(pdfFilename: string): string {
  return PDF_EXTENSION.test(pdfFilename)
    ? pdfFilename.replace(PDF_EXTENSION, ".json")
    : `${pdfFilename}.json`;
}

/** Returns a string because the workflow body has no `Buffer` global; steps encode it. */
export function pdfHlSourceContent(sourceEntries: Record<string, string>): string {
  return JSON.stringify(sourceEntries);
}

export function parsePdfHlOutputValues(content: Buffer): Record<string, string> {
  return pdfHlOutputSchema.parse(JSON.parse(content.toString("utf8")) as unknown);
}

export type PdfTranslationRenderResult =
  | { ok: true; content: Buffer; overflowKeyCount: number }
  | { ok: false; code: "pdf_script_unsupported" | "pdf_render_failed" };

/** Renders the `hl run` JSON output for one locale into a copy of the source PDF.
 * go-svc rejections are returned so the workflow fails only that locale; transport
 * and 5xx errors throw so the step retries. */
export async function renderPdfTranslationStep(input: {
  sandboxId: string;
  valuesFilename: string;
  template: Buffer;
  targetLocale: string;
}): Promise<PdfTranslationRenderResult> {
  "use step";
  const { readTranslatedFile } = await import("@/lib/translation/sandbox");
  const { createGoSvcServerClient } = await import("@/lib/go-svc/go-svc-server-client");
  const { GoSvcClientError } = await import("@/lib/go-svc/go-svc-request");

  const values = parsePdfHlOutputValues(
    await readTranslatedFile(input.sandboxId, input.valuesFilename),
  );
  try {
    const applied = await createGoSvcServerClient().pdf.apply({
      template: input.template,
      values,
      targetLocale: input.targetLocale,
    });
    return {
      ok: true,
      content: Buffer.from(applied.content),
      overflowKeyCount: applied.overflowKeys.length,
    };
  } catch (error) {
    if (
      error instanceof GoSvcClientError &&
      error.status !== null &&
      error.status >= 400 &&
      error.status < 500
    ) {
      return {
        ok: false,
        code:
          error.code === "pdf_script_unsupported" ? "pdf_script_unsupported" : "pdf_render_failed",
      };
    }
    throw error;
  }
}
