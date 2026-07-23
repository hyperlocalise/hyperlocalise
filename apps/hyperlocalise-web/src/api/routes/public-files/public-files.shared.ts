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
import { badRequestResponse, JsonContext, notFoundResponse } from "@/api/response.schema";

export function invalidFilePayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_file_payload");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}

export function fileNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "file_not_found");
}

export function unsupportedFileResponse(c: JsonContext, filename: string) {
  return badRequestResponse(c, "unsupported_translation_source_file", undefined, {
    filename,
  });
}
