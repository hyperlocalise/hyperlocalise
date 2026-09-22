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
import type {
  EditorExportBody,
  GoSvcRequestOptions,
  ValidateSegmentBody,
  ValidateSegmentResult,
} from "./go-svc-client.types";
import type { GoSvcRequest } from "./go-svc-request";

export class GoSvcCatApi {
  constructor(private readonly request: GoSvcRequest) {}

  validateSegment(body: ValidateSegmentBody, options: GoSvcRequestOptions = {}) {
    return this.request.json<ValidateSegmentResult>("/v1/validate/segment", {
      method: "POST",
      body,
      ...options,
    });
  }

  exportFilteredEditorRows(body: EditorExportBody, options: GoSvcRequestOptions = {}) {
    return this.request.download("/v1/editor-export/filtered/serialize", {
      method: "POST",
      body,
      ...options,
    });
  }
}
