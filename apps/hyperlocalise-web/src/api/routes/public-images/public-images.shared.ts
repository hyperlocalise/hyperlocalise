/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { badRequestResponse, JsonContext, notFoundResponse } from "@/api/response.schema";

export function invalidImagePayloadResponse(c: JsonContext) {
  return badRequestResponse(c, "invalid_image_payload");
}

export function projectNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "project_not_found");
}

export function imageVariantNotFoundResponse(c: JsonContext) {
  return notFoundResponse(
    c,
    "image_variant_not_found",
    "No image variant is available for this source path and locale.",
  );
}
