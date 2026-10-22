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
import type { HlEntriesPayload } from "@/lib/projects/files/hl-entries";
import { parseHlEntriesJson } from "@/lib/projects/files/hl-entries";

import { GoSvcClientError, type GoSvcRequest } from "./go-svc-request";

export type ApplyPdfTranslationsInput = {
  template: Uint8Array;
  values: Readonly<Record<string, string>>;
  targetLocale: string;
};

export type ApplyPdfTranslationsResult = {
  content: Buffer;
  overflowKeys: string[];
};

export class GoSvcPdfApi {
  constructor(private readonly request: GoSvcRequest) {}

  async extractEntries(input: { template: Uint8Array }): Promise<HlEntriesPayload> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(input.template)], { type: "application/pdf" }),
      "source.pdf",
    );

    const response = await this.request.response("/internal/pdf/entries", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      let message = "Could not read text from the PDF";
      let code = "pdf_parse_failed";
      try {
        const body = (await response.json()) as { message?: string; error?: string };
        if (body.message) message = body.message;
        if (body.error) code = body.error;
      } catch {
        // ignore non-JSON errors
      }
      throw new GoSvcClientError({
        code,
        message,
        status: response.status,
      });
    }
    return parseHlEntriesJson((await response.json()) as Record<string, unknown>);
  }

  async applyTranslations(input: ApplyPdfTranslationsInput): Promise<ApplyPdfTranslationsResult> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(input.template)], { type: "application/pdf" }),
      "source.pdf",
    );
    form.append("values", JSON.stringify(input.values));
    form.append("targetLocale", input.targetLocale);

    const response = await this.request.response("/internal/pdf/apply", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      let message = "Could not apply PDF translations";
      try {
        const body = (await response.json()) as { message?: string; error?: string };
        if (body.message) message = body.message;
      } catch {
        // ignore non-JSON errors
      }
      throw new GoSvcClientError({
        code: "pdf_apply_failed",
        message,
        status: response.status,
      });
    }
    const overflowHeader = response.headers.get("x-hyperlocalise-overflow-keys") ?? "";
    const overflowKeys = overflowHeader
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return {
      content: Buffer.from(arrayBuffer),
      overflowKeys,
    };
  }
}
