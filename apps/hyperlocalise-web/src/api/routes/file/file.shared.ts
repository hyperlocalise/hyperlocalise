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
import { notFoundResponse } from "@/api/errors";

export function fileNotFoundResponse(c: { json: Parameters<typeof notFoundResponse>[0]["json"] }) {
  return notFoundResponse(c, "not_found", "File not found");
}
