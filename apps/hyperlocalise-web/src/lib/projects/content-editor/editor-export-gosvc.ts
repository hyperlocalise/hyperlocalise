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
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";

import type {
  ContentEditorFilteredExportFormat,
  ContentEditorFilteredExportRow,
} from "./content-editor-filtered-export";

export type EditorFilteredExportSerializeError = {
  code: "export_service_unavailable" | "export_service_failed" | "export_invalid_request";
  message: string;
};

export async function serializeEditorFilteredExportViaGoSvc(
  goSvcClient: GoSvcClient,
  input: {
    format: ContentEditorFilteredExportFormat;
    rows: readonly ContentEditorFilteredExportRow[];
  },
): Promise<
  Result<
    { body: Uint8Array; contentType: string; extension: string },
    EditorFilteredExportSerializeError
  >
> {
  try {
    const response = await goSvcClient.cat.exportFilteredEditorRows({
      format: input.format,
      rows: [...input.rows],
    });

    const extension = response.extension?.trim();
    const contentType = response.contentType?.trim();
    if (!extension || !contentType) {
      return err({
        code: "export_service_failed",
        message: "Editor export serialization returned an invalid response.",
      });
    }

    return ok({
      body: new Uint8Array(await response.blob.arrayBuffer()),
      contentType,
      extension,
    });
  } catch (error) {
    if (error instanceof GoSvcClientError && error.status === 400) {
      return err({
        code: "export_invalid_request",
        message: error.message,
      });
    }
    return err({
      code: "export_service_unavailable",
      message: "The editor export service is unavailable.",
    });
  }
}
