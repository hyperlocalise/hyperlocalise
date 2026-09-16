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
import { err, ok, type Result } from "@/lib/primitives/result/results";

import type {
  ContentEditorFilteredExportFormat,
  ContentEditorFilteredExportRow,
} from "./content-editor-filtered-export";

export type EditorFilteredExportSerializeError = {
  code: "export_service_unavailable" | "export_service_failed" | "export_invalid_request";
  message: string;
};

export async function serializeEditorFilteredExportViaGoSvc(input: {
  format: ContentEditorFilteredExportFormat;
  rows: readonly ContentEditorFilteredExportRow[];
}): Promise<
  Result<
    { body: Uint8Array; contentType: string; extension: string },
    EditorFilteredExportSerializeError
  >
> {
  try {
    const response = await fetch("/api/go-svc/v1/editor-export/filtered/serialize", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        format: input.format,
        rows: input.rows,
      }),
    });

    if (response.status === 400) {
      const message = (await response.json().catch(() => null)) as { message?: string } | null;
      return err({
        code: "export_invalid_request",
        message: message?.message || "Invalid editor export request.",
      });
    }

    if (!response.ok) {
      return err({
        code: "export_service_failed",
        message: "Editor export serialization failed.",
      });
    }

    const extension = response.headers.get("X-Export-Extension")?.trim();
    const contentType = response.headers.get("Content-Type")?.trim();
    if (!extension || !contentType) {
      return err({
        code: "export_service_failed",
        message: "Editor export serialization returned an invalid response.",
      });
    }

    const body = new Uint8Array(await response.arrayBuffer());
    return ok({ body, contentType, extension });
  } catch {
    return err({
      code: "export_service_unavailable",
      message: "The editor export service is unavailable.",
    });
  }
}
