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
import { http, HttpResponse } from "msw";

import type { ProjectRecord } from "@/lib/go-svc/go-svc-client.types";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

export function storyGuidelineDocument(
  overrides: Partial<GuidelineDocument> = {},
): GuidelineDocument {
  return {
    id: "doc-1",
    projectId: null,
    locale: null,
    title: "Voice guide",
    filename: "voice.md",
    contentType: "text/markdown",
    byteSize: 128,
    characterCount: 120,
    truncated: false,
    revisionId: "rev-1",
    version: 1,
    mandatory: false,
    status: "ready",
    errorCode: null,
    indexed: true,
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-10T00:00:00Z",
    ...overrides,
  };
}

function listPage(documents: GuidelineDocument[]) {
  return {
    guidelineDocuments: documents,
    nextCursor: null,
    pagination: { limit: 200, returned: documents.length, hasMore: false },
  };
}

function formText(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value ? value : null;
}

/**
 * In-memory MSW handlers for the guideline document endpoints. Mutations
 * (upload, replace, metadata update, delete) update the store so refetches
 * reflect them, keeping stories interactive.
 */
export function createGuidelineDocumentsMswHandlers(
  options: {
    documents?: GuidelineDocument[];
    contents?: Record<string, string>;
    failList?: boolean;
  } = {},
) {
  const documents = (options.documents ?? []).map((document) => ({ ...document }));
  const contents: Record<string, string> = { ...options.contents };
  let createdCount = 0;

  return [
    http.get("*/v1/orgs/:organizationSlug/guidelines/documents", () => {
      if (options.failList) {
        return HttpResponse.json({ message: "go-svc is down" }, { status: 500 });
      }
      return HttpResponse.json(
        listPage(documents.filter((document) => document.projectId == null)),
      );
    }),
    http.get("*/v1/orgs/:organizationSlug/projects/:projectId/guidelines/documents", () =>
      HttpResponse.json(listPage(documents.filter((document) => document.projectId != null))),
    ),
    http.get("*/guidelines/documents/:documentId", ({ params }) => {
      const document = documents.find((item) => item.id === params.documentId);
      if (!document) {
        return HttpResponse.json({ message: "not found" }, { status: 404 });
      }
      return HttpResponse.json({
        guidelineDocument: {
          ...document,
          content: contents[document.id] ?? `# ${document.title}\n\nKeep product names in English.`,
        },
      });
    }),
    http.post("*/guidelines/documents", async ({ request }) => {
      const form = await request.formData();
      const file = form.get("file");
      const filename = formText(form, "filename") ?? "upload.md";
      const title = formText(form, "title") ?? filename;
      createdCount += 1;
      const document = storyGuidelineDocument({
        id: `doc-created-${createdCount}`,
        title,
        filename,
        contentType: file instanceof File && file.type ? file.type : "text/markdown",
        byteSize: file instanceof File ? file.size : 0,
        characterCount: file instanceof File ? file.size : 0,
        revisionId: `rev-created-${createdCount}`,
        status: "ready",
        indexed: true,
      });
      documents.unshift(document);
      return HttpResponse.json({ guidelineDocument: document });
    }),
    http.put("*/guidelines/documents/:documentId", async ({ params, request }) => {
      const document = documents.find((item) => item.id === params.documentId);
      if (!document) {
        return HttpResponse.json({ message: "not found" }, { status: 404 });
      }
      const contentType = request.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const metadata = (await request.json()) as Partial<GuidelineDocument>;
        if (metadata.title !== undefined) {
          document.title = metadata.title;
        }
        if (metadata.mandatory !== undefined) {
          document.mandatory = metadata.mandatory;
        }
      } else {
        const form = await request.formData();
        const title = formText(form, "title");
        if (title) {
          document.title = title;
        }
        const filename = formText(form, "filename") ?? document.filename;
        document.filename = filename;
        const file = form.get("file");
        document.byteSize = file instanceof File ? file.size : document.byteSize;
        document.characterCount = file instanceof File ? file.size : document.characterCount;
        document.version += 1;
        document.revisionId = `${document.revisionId}-r${document.version}`;
        document.status = "ready";
        document.indexed = true;
      }
      document.updatedAt = new Date().toISOString();
      return HttpResponse.json({ guidelineDocument: { ...document } });
    }),
    http.delete("*/guidelines/documents/:documentId", ({ params }) => {
      const index = documents.findIndex((item) => item.id === params.documentId);
      if (index >= 0) {
        documents.splice(index, 1);
      }
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

export function storyGuidelineProject(id: string, name: string): ProjectRecord {
  return {
    id,
    organizationId: "org_1",
    teamId: null,
    createdByUserId: null,
    name,
    identifier: id,
    description: "",
    translationContext: "",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    sourceLocale: "en",
    targetLocales: ["fr-FR"],
    externalProjectUrl: null,
    isActive: true,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-10T00:00:00Z",
    openJobCount: 0,
  };
}

/**
 * In-memory MSW handlers for per-document project assignments plus the
 * project list. Attach/detach mutations update the store so refetches
 * reflect them, keeping stories interactive.
 */
export function createGuidelineAssignmentMswHandlers(
  options: {
    assignedProjectIds?: string[];
  } = {},
) {
  const projects = [
    storyGuidelineProject("project_1", "Mobile app"),
    storyGuidelineProject("project_2", "Marketing site"),
    storyGuidelineProject("project_3", "Help center"),
  ];
  const assignments = new Map<string, string[]>([
    ["doc-brand", options.assignedProjectIds ?? ["project_1"]],
  ]);

  const projectName = (projectId: string) =>
    projects.find((project) => project.id === projectId)?.name ?? projectId;

  return [
    http.get("*/v1/orgs/:organizationSlug/guidelines/documents/assignments", () =>
      HttpResponse.json({
        assignments: [...assignments.entries()].map(([documentId, projectIds]) => ({
          documentId,
          projectIds,
        })),
      }),
    ),
    http.get("*/v1/orgs/:organizationSlug/projects", () => HttpResponse.json({ projects })),
    http.post("*/guidelines/documents/:documentId/projects", async ({ params, request }) => {
      const body = (await request.json()) as { projectId: string };
      const current = assignments.get(String(params.documentId)) ?? [];
      if (!current.includes(body.projectId)) {
        current.push(body.projectId);
      }
      assignments.set(String(params.documentId), current);
      return HttpResponse.json({
        projects: current.map((projectId) => ({ projectId, projectName: projectName(projectId) })),
      });
    }),
    http.delete("*/guidelines/documents/:documentId/projects/:projectId", ({ params }) => {
      const current = assignments.get(String(params.documentId)) ?? [];
      assignments.set(
        String(params.documentId),
        current.filter((projectId) => projectId !== params.projectId),
      );
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
