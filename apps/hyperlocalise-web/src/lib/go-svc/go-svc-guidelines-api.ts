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
import type { GoSvcRequestOptions } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export type GuidelineDocumentStatus = "processing" | "ready" | "failed";

export type GuidelineDocument = {
  id: string;
  /** @deprecated Project-owned guidelines are retired; always null for new rows. */
  projectId: string | null;
  /** @deprecated Use locales; mirrors locales[0] when exactly one locale is set. */
  locale: string | null;
  locales: string[];
  isGlobal: boolean;
  title: string;
  filename: string;
  contentType: string;
  byteSize: number;
  characterCount: number;
  truncated: boolean;
  revisionId: string;
  version: number;
  mandatory: boolean;
  status: GuidelineDocumentStatus;
  errorCode: string | null;
  indexed: boolean;
  createdAt: string;
  updatedAt: string;
  content?: string;
};

export type GuidelineDocumentUpload = {
  file: Blob;
  filename: string;
  title?: string;
  /** @deprecated Prefer locales. */
  locale?: string;
  locales?: string[];
  isGlobal?: boolean;
  mandatory?: boolean;
};

export type GuidelineDocumentMetadata = {
  title?: string;
  /** @deprecated Prefer locales. */
  locale?: string | null;
  locales?: string[] | null;
  isGlobal?: boolean;
  mandatory?: boolean;
};

export type GuidelineCheckField = "source" | "target";

export type GuidelineCheckRequest = {
  projectId?: string;
  sourceLocale?: string;
  targetLocale?: string;
  segments: { id: string; source?: string; target?: string }[];
  checks?: GuidelineCheckField[];
};

export type GuidelineCheckFinding = {
  segmentId: string;
  field: GuidelineCheckField;
  severity: "error" | "warning" | "info";
  start: number;
  end: number;
  message: string;
  suggestion?: string;
  passageId: string;
};

export type GuidelineCheckResult = {
  findings: GuidelineCheckFinding[];
  passages: { id: string; documentId: string; text: string }[];
  searchAvailable: boolean;
  model: string;
  uncheckedSegmentIds?: string[];
};

export type GuidelineProjectAssignment = {
  projectId: string;
  projectName: string;
  sourceLocale?: string;
};

export type GuidelineDocumentAssignment = {
  documentId: string;
  projectIds: string[];
};

export type GuidelineSweepResult = { scanned: number; republished: number; failed: number };

export type GuidelineRetrieveRequest = {
  projectId?: string;
  /** At most 8. Omit for documents that apply to every locale only. */
  locales?: string[];
  query: string;
  limit?: number;
};

export type RetrievedGuidelineDocument = {
  id: string;
  revisionId: string;
  version: number;
  title: string;
  /** @deprecated Use locales; mirrors locales[0] when exactly one locale is set. */
  locale?: string;
  locales: string[];
  mandatory: boolean;
  /** Set for mandatory documents only. */
  content?: string;
};

export type GuidelineRetrieveResult = {
  documents: RetrievedGuidelineDocument[];
  passages: { id: string; documentId: string; text: string }[];
  searchAvailable: boolean;
};

type GuidelineDocumentListPage = {
  guidelineDocuments: GuidelineDocument[];
  nextCursor: string | null;
  pagination: { limit: number; returned: number; hasMore: boolean };
};

/** Project routes are deprecated; new uploads must use the org route. */
function documentsPath(organizationSlug: string, projectId?: string, ...segments: string[]) {
  return projectId
    ? orgPath(organizationSlug, "projects", projectId, "guidelines", "documents", ...segments)
    : orgPath(organizationSlug, "guidelines", "documents", ...segments);
}

export function guidelineDocumentLocales(
  document: Pick<GuidelineDocument, "locales" | "locale">,
): string[] {
  if (Array.isArray(document.locales) && document.locales.length > 0) {
    return document.locales;
  }
  return document.locale ? [document.locale] : [];
}

function normalizeGuidelineDocument(
  document: GuidelineDocument | null | undefined,
): GuidelineDocument {
  if (!document) {
    throw new Error("guideline_document_missing");
  }
  return {
    ...document,
    projectId: document.projectId ?? null,
    locale: document.locale ?? null,
    locales: guidelineDocumentLocales(document),
    isGlobal: document.isGlobal ?? false,
    contentType: document.contentType ?? "application/octet-stream",
    characterCount: document.characterCount ?? 0,
    mandatory: document.mandatory ?? false,
    indexed: document.indexed ?? false,
  };
}

function uploadForm(upload: GuidelineDocumentUpload) {
  const form = new FormData();
  if (upload.title !== undefined) form.set("title", upload.title);
  if (upload.locales !== undefined) {
    form.set("locales", JSON.stringify(upload.locales));
  } else if (upload.locale !== undefined) form.set("locale", upload.locale);
  if (upload.isGlobal !== undefined) form.set("is_global", String(upload.isGlobal));
  if (upload.mandatory !== undefined) form.set("mandatory", String(upload.mandatory));
  form.set("file", upload.file, upload.filename);
  return form;
}

export class GoSvcGuidelinesApi {
  constructor(private readonly request: GoSvcRequest) {}

  async listDocuments(
    organizationSlug: string,
    projectId?: string,
    options: GoSvcRequestOptions & { locale?: string } = {},
  ) {
    const { locale, ...requestOptions } = options;
    // Reads always go through the org route; projectId becomes a ?project=
    // server filter (global or assigned docs) instead of a path scope.
    const path = documentsPath(organizationSlug);
    const documents: GuidelineDocument[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: "200" });
      if (projectId) query.set("project", projectId);
      if (locale) query.set("locale", locale);
      if (cursor) {
        query.set("cursor", cursor);
      }
      const body = await this.request.json<GuidelineDocumentListPage>(
        `${path}?${query}`,
        requestOptions,
      );
      for (const record of body.guidelineDocuments) {
        try {
          documents.push(normalizeGuidelineDocument(record));
        } catch (cause) {
          if (cause instanceof Error && cause.message === "guideline_document_missing") {
            continue;
          }
          throw cause;
        }
      }
      cursor = body.nextCursor ?? undefined;
    } while (cursor);
    return documents;
  }

  async getDocument(
    organizationSlug: string,
    documentId: string,
    projectId?: string,
    options: GoSvcRequestOptions = {},
  ) {
    const body = await this.request.json<{ guidelineDocument: GuidelineDocument }>(
      documentsPath(organizationSlug, projectId, documentId),
      options,
    );
    return normalizeGuidelineDocument(body.guidelineDocument);
  }

  downloadDocument(
    organizationSlug: string,
    documentId: string,
    projectId?: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.download(
      documentsPath(organizationSlug, projectId, documentId, "download"),
      {
        ...options,
      },
    );
  }

  async uploadDocument(
    organizationSlug: string,
    upload: GuidelineDocumentUpload,
    projectId?: string,
    options: GoSvcRequestOptions = {},
  ) {
    const body = await this.request.json<{ guidelineDocument: GuidelineDocument }>(
      documentsPath(organizationSlug, projectId),
      { method: "POST", body: uploadForm(upload), ...options },
    );
    return body.guidelineDocument;
  }

  async replaceDocument(
    organizationSlug: string,
    documentId: string,
    upload: GuidelineDocumentUpload,
    projectId?: string,
    options: GoSvcRequestOptions = {},
  ) {
    const body = await this.request.json<{ guidelineDocument: GuidelineDocument }>(
      documentsPath(organizationSlug, projectId, documentId),
      { method: "PUT", body: uploadForm(upload), ...options },
    );
    return body.guidelineDocument;
  }

  async updateDocument(
    organizationSlug: string,
    documentId: string,
    metadata: GuidelineDocumentMetadata,
    projectId?: string,
    options: GoSvcRequestOptions = {},
  ) {
    const body = await this.request.json<{ guidelineDocument: GuidelineDocument }>(
      documentsPath(organizationSlug, projectId, documentId),
      { method: "PUT", body: metadata, ...options },
    );
    return body.guidelineDocument;
  }

  deleteDocument(
    organizationSlug: string,
    documentId: string,
    projectId?: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(documentsPath(organizationSlug, projectId, documentId), {
      method: "DELETE",
      ...options,
    });
  }

  check(organizationSlug: string, body: GuidelineCheckRequest, options: GoSvcRequestOptions = {}) {
    return this.request.json<GuidelineCheckResult>(
      orgPath(organizationSlug, "guidelines", "check"),
      { method: "POST", body, ...options },
    );
  }

  /**
   * Server-only: requires a client created with service authentication.
   * Callers must enforce feature flags and project access first.
   */
  internalCheck(
    organizationId: string,
    body: GuidelineCheckRequest,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GuidelineCheckResult>("/internal/guidelines/check", {
      method: "POST",
      body: { organizationId, ...body },
      ...options,
    });
  }

  /**
   * Server-only: requires a client created with service authentication.
   * Returns uploaded guideline documents only. Callers must authorize the project first.
   */
  internalRetrieve(
    organizationId: string,
    body: GuidelineRetrieveRequest,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GuidelineRetrieveResult>("/internal/guidelines/retrieve", {
      method: "POST",
      body: { organizationId, ...body },
      ...options,
    });
  }

  /** Server-only: requires a client created with service authentication. */
  sweep(options: GoSvcRequestOptions = {}) {
    return this.request.json<GuidelineSweepResult>("/internal/guidelines/sweep", {
      method: "POST",
      ...options,
    });
  }

  listDocumentProjects(
    organizationSlug: string,
    documentId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ projects: GuidelineProjectAssignment[] }>(
      orgPath(organizationSlug, "guidelines", "documents", documentId, "projects"),
      options,
    );
  }

  listAllDocumentAssignments(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ assignments: GuidelineDocumentAssignment[] }>(
      orgPath(organizationSlug, "guidelines", "documents", "assignments"),
      options,
    );
  }

  attachDocumentProject(
    organizationSlug: string,
    documentId: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ projects: GuidelineProjectAssignment[] }>(
      orgPath(organizationSlug, "guidelines", "documents", documentId, "projects"),
      { method: "POST", body: { projectId }, ...options },
    );
  }

  detachDocumentProject(
    organizationSlug: string,
    documentId: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "guidelines", "documents", documentId, "projects", projectId),
      { method: "DELETE", ...options },
    );
  }
}
