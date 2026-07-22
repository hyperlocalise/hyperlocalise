/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { badRequestResponse, JsonContext, notFoundResponse } from "@/api/response.schema";

export function invalidTranslationPayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_translation_payload");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}

export function sourceFileTooLargeResponse(c: JsonContext, maxKeyCount: number) {
  return c.json(
    {
      error: "source_file_too_large",
      message: `Source file exceeds the maximum of ${maxKeyCount} keys`,
    },
    422,
  );
}

export function sourceFileNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "source_file_not_found", "Source file not found");
}

export function translationsNotFoundResponse(c: JsonContext) {
  return notFoundResponse(
    c,
    "translations_not_found",
    "No translations are available for this source file and locale.",
  );
}
