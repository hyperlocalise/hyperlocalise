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
  projectId: string | null;
  locale: string | null;
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
  locale?: string;
  mandatory?: boolean;
};

export type GuidelineDocumentMetadata = {
  title?: string;
  locale?: string | null;
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
};

export type GuidelineSweepResult = { scanned: number; republished: number; failed: number };

type GuidelineDocumentListPage = {
  guidelineDocuments: GuidelineDocument[];
  nextCursor: string | null;
  pagination: { limit: number; returned: number; hasMore: boolean };
};

/** Omit projectId for workspace-wide documents. */
function documentsPath(organizationSlug: string, projectId?: string, ...segments: string[]) {
  return projectId
    ? orgPath(organizationSlug, "projects", projectId, "guidelines", "documents", ...segments)
    : orgPath(organizationSlug, "guidelines", "documents", ...segments);
}

function uploadForm(upload: GuidelineDocumentUpload) {
  const form = new FormData();
  if (upload.title !== undefined) form.set("title", upload.title);
  if (upload.locale !== undefined) form.set("locale", upload.locale);
  if (upload.mandatory !== undefined) form.set("mandatory", String(upload.mandatory));
  form.set("file", upload.file, upload.filename);
  return form;
}

export class GoSvcGuidelinesApi {
  constructor(private readonly request: GoSvcRequest) {}

  async listDocuments(
    organizationSlug: string,
    projectId?: string,
    options: GoSvcRequestOptions = {},
  ) {
    const path = documentsPath(organizationSlug, projectId);
    const documents: GuidelineDocument[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: "200" });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const body = await this.request.json<GuidelineDocumentListPage>(`${path}?${query}`, options);
      documents.push(...body.guidelineDocuments);
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
    return body.guidelineDocument;
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

  /** Server-only: requires a client created with service authentication. */
  sweep(options: GoSvcRequestOptions = {}) {
    return this.request.json<GuidelineSweepResult>("/internal/guidelines/sweep", {
      method: "POST",
      ...options,
    });
  }
}
