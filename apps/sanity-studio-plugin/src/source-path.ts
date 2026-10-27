function sanitizePathSegment(value: string, fallback: string, maxLength = 128): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return sanitized || fallback;
}

function slugifyDocumentTitle(title: string | undefined): string {
  const slug = (title ?? "document")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "document";
}

function sanitizeSanityPublishedId(documentId: string): string {
  const withoutDrafts = documentId.replace(/^drafts\./, "");
  return sanitizePathSegment(withoutDrafts.replace(/\./g, "-"), "document");
}

function buildSanityDocumentFileName(input: {
  documentId: string;
  documentTitle?: string;
}): string {
  const titleSlug = slugifyDocumentTitle(input.documentTitle);
  return `${titleSlug}-${sanitizeSanityPublishedId(input.documentId)}.json`;
}

export function buildSanityDocumentSourcePath(input: {
  sanityProjectId: string;
  dataset: string;
  documentType: string;
  documentId: string;
  documentTitle?: string;
}): string {
  return `sanity-plugin/${sanitizePathSegment(input.sanityProjectId, "unknown")}/${sanitizePathSegment(input.dataset, "production")}/${sanitizePathSegment(input.documentType, "document")}/${buildSanityDocumentFileName(
    {
      documentId: input.documentId,
      documentTitle: input.documentTitle,
    },
  )}`;
}
