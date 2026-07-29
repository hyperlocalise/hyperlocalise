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
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import { normalizeSourcePath } from "./records";

export function sourceFilename(path: string) {
  const normalizedPath = normalizeSourcePath(path);
  return normalizedPath.split("/").filter(Boolean).at(-1) ?? normalizedPath;
}

export function sourceContentType(path: string) {
  const format = inferSupportedTranslationFileFormat(path);
  switch (format) {
    case "json":
    case "jsonc":
    case "arb":
      return "application/json";
    case "xliff":
      return "application/xliff+xml";
    case "po":
    case "strings":
    case "stringsdict":
      return "text/plain";
    case "html":
      return "text/html";
    case "markdown":
    case "mdx":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
