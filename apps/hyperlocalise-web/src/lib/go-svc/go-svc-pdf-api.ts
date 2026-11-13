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
import type { GoSvcErrorBody, GoSvcRequestOptions } from "./go-svc-client.types";
import { GoSvcClientError, type GoSvcRequest } from "./go-svc-request";

export type PdfApplyResult = {
  content: Uint8Array;
  overflowKeys: string[];
};

const PDF_OVERFLOW_KEYS_HEADER = "x-hyperlocalise-overflow-keys";

export class GoSvcPdfApi {
  constructor(private readonly request: GoSvcRequest) {}

  async apply(
    input: {
      template: Uint8Array;
      values: Readonly<Record<string, string>>;
      targetLocale?: string;
    },
    options: GoSvcRequestOptions = {},
  ): Promise<PdfApplyResult> {
    const form = new FormData();
    form.set("values", JSON.stringify(input.values));
    if (input.targetLocale?.trim()) {
      form.set("targetLocale", input.targetLocale.trim());
    }
    form.set(
      "template",
      new Blob([Buffer.from(input.template)], { type: "application/pdf" }),
      "template.pdf",
    );

    const response = await this.request.response("/internal/pdf/apply", {
      method: "POST",
      body: form,
      ...options,
    });
    if (!response.ok) {
      throw await pdfApplyResponseError(response);
    }

    const overflowHeader = response.headers.get(PDF_OVERFLOW_KEYS_HEADER);
    const overflowKeys = overflowHeader
      ? overflowHeader
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean)
      : [];

    return {
      content: new Uint8Array(await response.arrayBuffer()),
      overflowKeys,
    };
  }
}

async function pdfApplyResponseError(response: Response): Promise<GoSvcClientError> {
  let body: GoSvcErrorBody = {};
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === "object" && parsed !== null) {
      body = parsed as GoSvcErrorBody;
    }
  } catch {
    // Non-JSON errors still carry HTTP status.
  }
  return new GoSvcClientError({
    code: typeof body.error === "string" && body.error ? body.error : "http_error",
    message:
      typeof body.message === "string" && body.message
        ? body.message
        : `go-svc request failed with status ${response.status}`,
    status: response.status,
    details: body.details,
  });
}
