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

import path from "node:path";

import { GOOGLE_DRIVE_SOURCE_PATH_PREFIX } from "./constants";

function sanitizeSegment(value: string): string {
  return value.replace(/[/\\]+/g, "_").trim();
}

export function buildGoogleDriveSourcePath(input: {
  rootFolderId: string;
  relativePath: string;
  fileName: string;
}): string {
  const root = sanitizeSegment(input.rootFolderId);
  const relative = input.relativePath.split("/").map(sanitizeSegment).filter(Boolean).join("/");
  const fileName = sanitizeSegment(input.fileName);
  const joined = relative
    ? `${GOOGLE_DRIVE_SOURCE_PATH_PREFIX}/${root}/${relative}/${fileName}`
    : `${GOOGLE_DRIVE_SOURCE_PATH_PREFIX}/${root}/${fileName}`;
  return path.posix.normalize(joined);
}
