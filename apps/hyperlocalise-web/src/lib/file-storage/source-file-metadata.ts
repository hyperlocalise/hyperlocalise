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
    case "xcstrings":
      return "application/json";
    case "yaml":
      return "application/yaml";
    case "xliff":
      return "application/xliff+xml";
    case "qt-ts":
      return "text/xml";
    case "xml":
    case "resx":
    case "resw":
    case "stringsdict":
      return "application/xml";
    case "po":
    case "strings":
    case "ini":
    case "ftl":
    case "properties":
      return "text/plain";
    case "html":
      return "text/html";
    case "markdown":
    case "mdx":
      return "text/markdown";
    case "asciidoc":
      return "text/asciidoc";
    case "csv":
      return "text/csv";
    case "tsv":
      return "text/tab-separated-values";
    case "toml":
      return "application/toml";
    case "sbv":
      return "text/plain";
    case "svg":
      return "image/svg+xml";
    case "php":
      return "application/x-httpd-php";
    case "javascript":
      return "text/javascript";
    case "liquid":
      return "application/liquid";
    case "srt":
      return "application/x-subrip";
    case "vtt":
      return "text/vtt";
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "lottie":
      return "application/zip+dotlottie";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}
