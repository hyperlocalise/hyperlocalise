export function toBase64AttachmentContent(content: Buffer): string {
  return content.toString("base64");
}

const utf8AttachmentContentTypes: Record<string, string> = {
  ".arb": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonc": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mdx": "text/markdown; charset=utf-8",
  ".po": "text/x-gettext-translation; charset=utf-8",
  ".strings": "text/plain; charset=utf-8",
  ".stringsdict": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xlf": "application/x-xliff+xml; charset=utf-8",
  ".xlif": "application/x-xliff+xml; charset=utf-8",
  ".xliff": "application/x-xliff+xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
};

export function inferAttachmentContentType(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return "application/octet-stream";
  }

  const extension = filename.slice(dotIndex).toLowerCase();
  return utf8AttachmentContentTypes[extension] ?? "application/octet-stream";
}
