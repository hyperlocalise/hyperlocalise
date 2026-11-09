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
import type { ContentEditorFilteredExportFormat } from "@/lib/projects/content-editor/content-editor-filtered-export";
import type { GoSvcErrorBody, GoSvcRequestOptions } from "./go-svc-client.types";
import { GoSvcClientError, type GoSvcRequest } from "./go-svc-request";

export type EditorExportParsedRow = {
  key: string;
  sourceText: string;
  targetText: string;
  sourceLocale: string;
  targetLocale: string;
  sourcePath?: string;
};

export class GoSvcEditorExportApi {
  constructor(private readonly request: GoSvcRequest) {}

  async parseFiltered(
    input: {
      format?: ContentEditorFilteredExportFormat | "";
      filename: string;
      body: Uint8Array;
    },
    options: GoSvcRequestOptions = {},
  ): Promise<{ rows: EditorExportParsedRow[] }> {
    const form = new FormData();
    if (input.format) {
      form.set("format", input.format);
    }
    form.set("file", new Blob([Buffer.from(input.body)]), input.filename);

    const response = await this.request.response("/internal/editor-export/filtered/parse", {
      method: "POST",
      body: form,
      ...options,
    });
    if (!response.ok) {
      throw await editorExportParseResponseError(response);
    }

    const parsed: unknown = await response.json();
    if (!isEditorExportParseResponse(parsed)) {
      throw new GoSvcClientError({
        code: "invalid_response",
        message: "go-svc returned an invalid bilingual parse response",
        status: response.status,
      });
    }
    return parsed;
  }
}

function isEditorExportParseResponse(value: unknown): value is { rows: EditorExportParsedRow[] } {
  if (typeof value !== "object" || value === null || !("rows" in value)) {
    return false;
  }
  return Array.isArray((value as { rows: unknown }).rows);
}

async function editorExportParseResponseError(response: Response): Promise<GoSvcClientError> {
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
