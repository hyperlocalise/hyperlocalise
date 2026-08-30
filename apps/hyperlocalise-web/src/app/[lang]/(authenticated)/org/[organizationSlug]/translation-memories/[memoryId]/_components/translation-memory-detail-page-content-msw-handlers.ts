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
import { delay, http, HttpResponse } from "msw";

import type {
  MemoryEntryDetailResponse,
  MemoryEntryRecord,
  MemoryProjectRecord,
  MemoryRecord,
} from "@/api/routes/memory/memory.schema";
import type { ProjectRecord } from "@/api/routes/project/project.schema";

function createEntryDetail(entry: MemoryEntryRecord): MemoryEntryDetailResponse {
  const emptyActor = {
    userId: null,
    displayName: null,
    at: null,
    source: "created" as const,
  };

  return {
    memoryEntry: entry,
    provenance: {
      origin: entry.provenance,
      provider: null,
      importBatchId: entry.importBatchId,
      context: typeof entry.metadata.context === "string" ? entry.metadata.context : null,
      created: {
        ...emptyActor,
        userId: entry.createdByUserId,
        at: entry.createdAt,
        source: "created",
      },
      modified: { ...emptyActor, at: entry.updatedAt, source: "modified" },
      reviewed: { ...emptyActor, source: "reviewed" },
      imported: { ...emptyActor, source: "imported" },
      providerSupplied: { ...emptyActor, source: "provider" },
    },
    variants: [],
    auditEvents: [
      {
        id: `${entry.id}:created`,
        eventType: "created",
        actorKind: "user",
        actorUserId: entry.createdByUserId,
        actorDisplayName: null,
        version: 1,
        changedFields: [],
        attributes: {},
        occurredAt: entry.createdAt,
      },
    ],
    capabilities: {
      canEdit: entry.provenance !== "external_tms",
      readOnlyReason: null,
    },
  };
}

export function createTranslationMemoryDetailMswHandlers({
  memory,
  entries,
  attachedProjects = [],
  projects = [],
  memoryLoading = false,
  memoryMissing = false,
  entriesLoading = false,
}: {
  memory: MemoryRecord;
  entries: MemoryEntryRecord[];
  attachedProjects?: MemoryProjectRecord[];
  projects?: Array<Pick<ProjectRecord, "id" | "name">>;
  memoryLoading?: boolean;
  memoryMissing?: boolean;
  entriesLoading?: boolean;
}) {
  let currentEntries = [...entries];
  let currentAttachedProjects = [...attachedProjects];

  return [
    http.get("/api/orgs/:organizationSlug/translation-memories/:memoryId", async () => {
      if (memoryLoading) {
        await delay("infinite");
      }
      if (memoryMissing) {
        return HttpResponse.json({ error: "memory_not_found" }, { status: 404 });
      }
      return HttpResponse.json({ memory });
    }),
    http.get("/api/orgs/:organizationSlug/translation-memories/:memoryId/projects", () =>
      HttpResponse.json({ projects: currentAttachedProjects }),
    ),
    http.post(
      "/api/orgs/:organizationSlug/translation-memories/:memoryId/projects",
      async ({ request }) => {
        const body = (await request.json()) as { projectId: string };
        const project = projects.find((item) => item.id === body.projectId);
        if (project && !currentAttachedProjects.some((item) => item.projectId === project.id)) {
          currentAttachedProjects = [
            ...currentAttachedProjects,
            {
              projectId: project.id,
              projectName: project.name,
              priority: 0,
              sourceLocale: "en-US",
              targetLocales: ["fr-FR"],
            },
          ];
        }
        return HttpResponse.json({ projects: currentAttachedProjects });
      },
    ),
    http.delete(
      "/api/orgs/:organizationSlug/translation-memories/:memoryId/projects/:projectId",
      ({ params }) => {
        currentAttachedProjects = currentAttachedProjects.filter(
          (project) => project.projectId !== String(params.projectId),
        );
        return new HttpResponse(null, { status: 204 });
      },
    ),
    http.get("/api/orgs/:organizationSlug/projects", () =>
      HttpResponse.json({
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
        })),
      }),
    ),
    http.get("/api/orgs/:organizationSlug/translation-memories/:memoryId/entries", async () => {
      if (entriesLoading) {
        await delay("infinite");
      }
      return HttpResponse.json({
        memoryEntries: currentEntries,
        nextCursor: null,
        total: currentEntries.length,
        pagination: {
          limit: 50,
          returned: currentEntries.length,
          hasMore: false,
        },
      });
    }),
    http.get(
      "/api/orgs/:organizationSlug/translation-memories/:memoryId/entries/:entryId",
      ({ params }) => {
        const entry = currentEntries.find((item) => item.id === String(params.entryId));
        if (!entry) {
          return HttpResponse.json({ error: "memory_entry_not_found" }, { status: 404 });
        }
        return HttpResponse.json(createEntryDetail(entry));
      },
    ),
    http.post(
      "/api/orgs/:organizationSlug/translation-memories/:memoryId/entries",
      async ({ request }) => {
        const body = (await request.json()) as {
          sourceLocale: string;
          targetLocale: string;
          sourceText: string;
          targetText: string;
        };
        const created: MemoryEntryRecord = {
          id: crypto.randomUUID(),
          memoryId: memory.id,
          sourceLocale: body.sourceLocale,
          targetLocale: body.targetLocale,
          sourceText: body.sourceText,
          targetText: body.targetText,
          matchScore: 100,
          provenance: "manual",
          reviewStatus: "approved",
          version: 1,
          externalKey: null,
          createdByUserId: null,
          modifiedByUserId: null,
          reviewedByUserId: null,
          importBatchId: null,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          reviewedAt: null,
        };
        currentEntries = [created, ...currentEntries];
        return HttpResponse.json({ memoryEntry: created }, { status: 201 });
      },
    ),
    http.delete(
      "/api/orgs/:organizationSlug/translation-memories/:memoryId/entries/:entryId",
      ({ params }) => {
        currentEntries = currentEntries.filter((entry) => entry.id !== String(params.entryId));
        return new HttpResponse(null, { status: 204 });
      },
    ),
  ];
}
