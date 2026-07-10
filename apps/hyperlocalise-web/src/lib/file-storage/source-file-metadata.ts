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
