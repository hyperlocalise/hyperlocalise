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
import { randomUUID } from "node:crypto";

import { and, count, desc, eq, inArray } from "drizzle-orm";

import {
  buildAccessibleProjectsWhere,
  buildProjectLinkedMemoryWhere,
} from "@/api/auth/team-access";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import { conflictResponse, badRequestResponse } from "@/api/response.schema";
import { apiErrorResponse } from "@/api/response.schema";
import { isErr } from "@/lib/primitives/result/results";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database/client";
import type { Memory } from "@/lib/database/types";
import { writeActivityLogEvent } from "@/lib/activity-log/activity-log-writer";
import { applyMemoryImport, parseMemoryImportContent } from "@/lib/memory/import-memory-entries";
import { exportMemoryEntriesTmx } from "@/lib/memory/export-memory-entries";
import { toMemoryRecord } from "@/lib/memory/memory-records";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";
import { promoteApprovedProjectTranslationsToMemory } from "@/lib/projects/translations/project-translation-service";

import { getOwnedProject, projectNotFoundResponse } from "../project/project.shared";
import {
  attachMemoryProjectBodySchema,
  createMemoryEntryBodySchema,
  createMemoryBodySchema,
  exportMemoryEntriesQuerySchema,
  importMemoryEntriesBodySchema,
  promoteMemoryFromProjectBodySchema,
  listMemoryEntriesQuerySchema,
  listMemoryQuerySchema,
  memoryEntryIdParamsSchema,
  memoryIdParamsSchema,
  memoryProjectParamsSchema,
  updateMemoryEntryBodySchema,
  updateMemoryBodySchema,
  type AttachMemoryProjectBody,
  type CreateMemoryEntryBody,
  type CreateMemoryBody,
  type ExportMemoryEntriesQuery,
  type MemoryEntryRecord,
  type PromoteMemoryFromProjectBody,
  type ListMemoryQuery,
  type UpdateMemoryEntryBody,
  type UpdateMemoryBody,
} from "./memory.schema";
import {
  externalTmsMemoryImmutableResponse,
  forbiddenResponse,
  invalidMemoryPayloadResponse,
  isMemoryMutationAllowed,
  getOwnedMemory,
  ownedMemoryWhere,
  memoryEntryReadOnlyResponse,
  memoryNotFoundResponse,
} from "./memory.shared";
import { listMemoryEntriesPage } from "./memory-entry-list";
import { getMemoryEntryDetail, toMemoryEntryDetailRecord } from "@/lib/memory/memory-entry-detail";
import {
  isMemoryEntryWritable,
  recordMemoryEntryCreatedEvent,
  updateMemoryEntrySafely,
} from "@/lib/memory/memory-entry-lifecycle";

type MemoryListResult = {
  memories: Memory[];
  total: number;
};

type MemoryStore = {
  list(auth: ApiAuthContext, query?: ListMemoryQuery): Promise<MemoryListResult>;
  create(auth: ApiAuthContext, payload: CreateMemoryBody): Promise<Memory>;
  getById(auth: ApiAuthContext, memoryId: string): Promise<Memory | null>;
  update(auth: ApiAuthContext, memoryId: string, payload: UpdateMemoryBody): Promise<Memory | null>;
  delete(auth: ApiAuthContext, memoryId: string): Promise<boolean>;
};

type MemoryEntry = typeof schema.memoryEntries.$inferSelect;

type MemoryProjectRecord = {
  projectId: string;
  projectName: string;
  priority: number;
  sourceLocale: string | null;
  targetLocales: string[];
};

const memoryStore: MemoryStore = {
  async list(auth, query) {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    const projectId = query?.projectId;
    if (projectId && !(await getOwnedProject(auth, projectId))) {
      return { memories: [], total: 0 };
    }

    const accessWhere = await buildProjectLinkedMemoryWhere(auth);
    const projectMemoryIds = projectId
      ? db
          .select({ memoryId: schema.projectMemories.memoryId })
          .from(schema.projectMemories)
          .where(
            and(
              eq(schema.projectMemories.projectId, projectId),
              eq(schema.projectMemories.organizationId, auth.organization.localOrganizationId),
            ),
          )
      : null;
    const where = projectMemoryIds
      ? and(accessWhere, inArray(schema.memories.id, projectMemoryIds))
      : accessWhere;

    const [memories, totalRow] = await Promise.all([
      db
        .select()
        .from(schema.memories)
        .where(where)
        .orderBy(desc(schema.memories.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(schema.memories).where(where),
    ]);

    return { memories, total: totalRow[0]?.value ?? 0 };
  },
  async create(auth, payload) {
    const [memory] = await db
      .insert(schema.memories)
      .values({
        organizationId: auth.organization.localOrganizationId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description ?? "",
      })
      .returning();

    serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.memoryCreated, {
      status: "created",
      source: "memory",
    });
    return memory;
  },
  async getById(auth, memoryId) {
    return getOwnedMemory(auth, memoryId);
  },
  async update(auth, memoryId, payload) {
    const [memory] = await db
      .update(schema.memories)
      .set(payload)
      .where(await ownedMemoryWhere(auth, memoryId))
      .returning();

    return memory ?? null;
  },
  async delete(auth, memoryId) {
    const memoryWhere = await ownedMemoryWhere(auth, memoryId);
    return db.transaction(async (tx) => {
      const deletedMemories = await tx
        .delete(schema.memories)
        .where(memoryWhere)
        .returning({ id: schema.memories.id });

      if (deletedMemories.length === 0) {
        return false;
      }

      await tx.delete(schema.projectMemories).where(eq(schema.projectMemories.memoryId, memoryId));

      return true;
    });
  },
};

function toMemoryEntryRecord(entry: MemoryEntry): MemoryEntryRecord {
  return toMemoryEntryDetailRecord(entry);
}

function tmxFatalResponse(
  c: Parameters<typeof badRequestResponse>[0],
  error: { code: string; message: string; unitCount?: number; maxUnits?: number },
) {
  return badRequestResponse(c, error.code, error.message, {
    ...(error.unitCount !== undefined ? { unitCount: error.unitCount } : {}),
    ...(error.maxUnits !== undefined ? { maxUnits: error.maxUnits } : {}),
  });
}

async function createMemoryEntry(
  memory: Memory,
  payload: CreateMemoryEntryBody,
  createdByUserId?: string,
): Promise<MemoryEntry | null> {
  const normalizedSourceText = normalizeTranslationMemorySourceText(payload.sourceText);
  const existing = await db
    .select({ id: schema.memoryEntries.id })
    .from(schema.memoryEntries)
    .where(
      and(
        eq(schema.memoryEntries.memoryId, memory.id),
        eq(schema.memoryEntries.sourceLocale, payload.sourceLocale),
        eq(schema.memoryEntries.targetLocale, payload.targetLocale),
        eq(schema.memoryEntries.normalizedSourceText, normalizedSourceText),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return null;
  }

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(schema.memoryEntries)
      .values({
        memoryId: memory.id,
        sourceLocale: payload.sourceLocale,
        targetLocale: payload.targetLocale,
        sourceText: payload.sourceText,
        normalizedSourceText,
        targetText: payload.targetText,
        matchScore: payload.matchScore,
        provenance: "manual",
        createdByUserId,
      })
      .onConflictDoNothing()
      .returning();

    if (!entry) {
      return null;
    }

    await recordMemoryEntryCreatedEvent({
      entry,
      actorUserId: createdByUserId,
      client: tx,
    });
    return entry;
  });
}

async function listMemoryProjects(
  auth: ApiAuthContext,
  memoryId: string,
): Promise<MemoryProjectRecord[]> {
  const accessibleProjectsWhere = await buildAccessibleProjectsWhere(auth);

  return db
    .select({
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      priority: schema.projectMemories.priority,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projectMemories)
    .innerJoin(schema.projects, eq(schema.projectMemories.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projectMemories.organizationId, auth.organization.localOrganizationId),
        eq(schema.projectMemories.memoryId, memoryId),
        accessibleProjectsWhere,
      ),
    )
    .orderBy(schema.projectMemories.priority, schema.projects.name);
}

const validateMemoryParams = validator("param", (value, c) => {
  const parsed = memoryIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return memoryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateMemoryEntryParams = validator("param", (value, c) => {
  const parsed = memoryEntryIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return memoryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateMemoryProjectParams = validator("param", (value, c) => {
  const parsed = memoryProjectParamsSchema.safeParse(value);

  if (!parsed.success) {
    return memoryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateCreateMemoryBody = validator("json", (value, c) => {
  const parsed = createMemoryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateUpdateMemoryBody = validator("json", (value, c) => {
  const parsed = updateMemoryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateListMemoryEntriesQuery = validator("query", (value, c) => {
  const parsed = listMemoryEntriesQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateCreateMemoryEntryBody = validator("json", (value, c) => {
  const parsed = createMemoryEntryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateUpdateMemoryEntryBody = validator("json", (value, c) => {
  const parsed = updateMemoryEntryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateImportMemoryEntriesBody = validator("json", (value, c) => {
  const parsed = importMemoryEntriesBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateExportMemoryEntriesQuery = validator("query", (value, c) => {
  const parsed = exportMemoryEntriesQuerySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validatePromoteMemoryFromProjectBody = validator("json", (value, c) => {
  const parsed = promoteMemoryFromProjectBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateAttachMemoryProjectBody = validator("json", (value, c) => {
  const parsed = attachMemoryProjectBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateListMemoryQuery = validator("query", (value, _c) => {
  const parsed = listMemoryQuerySchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  return parsed.data;
});

export function createMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateListMemoryQuery, async (c) => {
      const query = c.req.valid("query");
      const { memories, total } = await memoryStore.list(c.var.auth, query);
      return c.json({ memories: memories.map(toMemoryRecord), total }, 200);
    })
    .post("/", validateCreateMemoryBody, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const memory = await memoryStore.create(c.var.auth, payload);
      void writeActivityLogEvent({
        actorCredentialId: null,
        actorKind: "user",
        actorUserId: c.var.auth.user.localUserId,
        eventType: "translation_memory_created",
        organizationId: c.var.auth.organization.localOrganizationId,
        payload: {
          name: memory.name,
          providerKind: memory.externalProviderKind ?? undefined,
          resourceId: memory.id,
          source: memory.source,
        },
        targetId: memory.id,
        targetKind: "translation_memory",
      });
      return c.json({ memory: toMemoryRecord(memory) }, 201);
    })
    .get("/:memoryId", validateMemoryParams, async (c) => {
      const params = c.req.valid("param");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      return c.json({ memory: toMemoryRecord(memory) }, 200);
    })
    .get("/:memoryId/entries", validateMemoryParams, validateListMemoryEntriesQuery, async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      const page = await listMemoryEntriesPage(params.memoryId, query);
      if (isErr(page)) {
        return validationErrorResponse(c, page.error.code, page.error.message);
      }

      return c.json(
        {
          memoryEntries: page.value.entries.map(toMemoryEntryRecord),
          nextCursor: page.value.nextCursor,
          total: page.value.total,
          pagination: page.value.pagination,
        },
        200,
      );
    })
    .get(
      "/:memoryId/entries/export",
      validateMemoryParams,
      validateExportMemoryEntriesQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query: ExportMemoryEntriesQuery = c.req.valid("query");
        const memory = await memoryStore.getById(c.var.auth, params.memoryId);

        if (!memory) {
          return memoryNotFoundResponse(c);
        }

        const exported = await exportMemoryEntriesTmx({
          memoryId: memory.id,
          memoryName: memory.name,
          filters: {
            sourceLocale: query.sourceLocale,
            targetLocale: query.targetLocale,
          },
        });

        void writeActivityLogEvent({
          actorCredentialId: null,
          actorKind: "user",
          actorUserId: c.var.auth.user.localUserId,
          eventType: "translation_memory_exported",
          organizationId: c.var.auth.organization.localOrganizationId,
          payload: { resourceId: memory.id },
          targetId: memory.id,
          targetKind: "translation_memory",
        });

        return c.body(exported.body, 200, {
          "Content-Type": "application/x-tmx+xml; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`,
        });
      },
    )
    .post("/:memoryId/entries", validateMemoryParams, validateCreateMemoryEntryBody, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }
      if (!isMemoryEntryWritable(memory)) {
        return memoryEntryReadOnlyResponse(
          c,
          memory.capabilityMode === "reference_only" ? "reference_only" : "external_tms",
        );
      }

      const entry = await createMemoryEntry(memory, payload, c.var.auth.user.localUserId);
      if (!entry) {
        return conflictResponse(
          c,
          "duplicate_memory_entry",
          "An entry with this source text and locale pair already exists",
        );
      }

      return c.json({ memoryEntry: toMemoryEntryRecord(entry) }, 201);
    })
    .post(
      "/:memoryId/entries/import",
      validateMemoryParams,
      validateImportMemoryEntriesBody,
      async (c) => {
        if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const memory = await memoryStore.getById(c.var.auth, params.memoryId);

        if (!memory) {
          return memoryNotFoundResponse(c);
        }
        if (!isMemoryEntryWritable(memory)) {
          return memoryEntryReadOnlyResponse(
            c,
            memory.capabilityMode === "reference_only" ? "reference_only" : "external_tms",
          );
        }

        const parsed = parseMemoryImportContent({
          format: payload.format,
          content: payload.content,
          maxUnits: payload.maxUnits,
        });
        if (isErr(parsed)) {
          return tmxFatalResponse(c, parsed.error);
        }

        const dryRun = payload.dryRun === true;
        const importBatchId = dryRun ? undefined : randomUUID();
        const applied = await applyMemoryImport({
          memory,
          parsed: parsed.value,
          dryRun,
          createdByUserId: c.var.auth.user.localUserId,
          importBatchId,
        });

        if (!dryRun) {
          void writeActivityLogEvent({
            actorCredentialId: null,
            actorKind: "user",
            actorUserId: c.var.auth.user.localUserId,
            eventType: "translation_memory_imported",
            organizationId: c.var.auth.organization.localOrganizationId,
            payload: {
              batchId: applied.importBatchId ?? undefined,
              itemCount: applied.report.created + applied.report.variantCreated,
              resourceId: memory.id,
            },
            targetId: memory.id,
            targetKind: "translation_memory",
          });
        }

        return c.json(
          {
            memoryEntries: applied.createdEntries.map(toMemoryEntryRecord),
            imported: applied.report.created + applied.report.variantCreated,
            skipped: applied.report.skipped,
            importBatchId: applied.importBatchId,
            dryRun,
            preview: applied.preview,
            report: applied.report,
          },
          dryRun ? 200 : 201,
        );
      },
    )
    .post(
      "/:memoryId/entries/promote-from-project",
      validateMemoryParams,
      validatePromoteMemoryFromProjectBody,
      async (c) => {
        if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload: PromoteMemoryFromProjectBody = c.req.valid("json");
        const memory = await memoryStore.getById(c.var.auth, params.memoryId);

        if (!memory) {
          return memoryNotFoundResponse(c);
        }
        if (!isMemoryEntryWritable(memory)) {
          return memoryEntryReadOnlyResponse(
            c,
            memory.capabilityMode === "reference_only" ? "reference_only" : "external_tms",
          );
        }

        const project = await getOwnedProject(c.var.auth, payload.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const result = await promoteApprovedProjectTranslationsToMemory({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: payload.projectId,
          memoryId: params.memoryId,
          sourceLocale: payload.sourceLocale,
          targetLocale: payload.targetLocale,
          sourcePath: payload.sourcePath,
        });

        if (result.reason === "memory_not_found") {
          return memoryNotFoundResponse(c);
        }

        if (result.reason === "memory_not_attached") {
          return badRequestResponse(
            c,
            "memory_not_attached_to_project",
            "Attach this translation memory to the project before promoting translations",
          );
        }

        if (result.reason === "source_file_not_found") {
          return badRequestResponse(c, "source_file_not_found", "Source file was not found");
        }

        return c.json(
          {
            promoted: result.promoted,
            skipped: result.skipped,
            reason: result.reason,
          },
          200,
        );
      },
    )
    .get("/:memoryId/entries/:entryId", validateMemoryEntryParams, async (c) => {
      const params = c.req.valid("param");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      const detail = await getMemoryEntryDetail({ memory, entryId: params.entryId });
      if (!detail) {
        return memoryNotFoundResponse(c);
      }

      return c.json(detail, 200);
    })
    .patch(
      "/:memoryId/entries/:entryId",
      validateMemoryEntryParams,
      validateUpdateMemoryEntryBody,
      async (c) => {
        if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload: UpdateMemoryEntryBody = c.req.valid("json");
        const memory = await memoryStore.getById(c.var.auth, params.memoryId);

        if (!memory) {
          return memoryNotFoundResponse(c);
        }

        const result = await updateMemoryEntrySafely({
          memory,
          entryId: params.entryId,
          expectedVersion: payload.expectedVersion,
          actorUserId: c.var.auth.user.localUserId,
          updates: {
            sourceLocale: payload.sourceLocale,
            targetLocale: payload.targetLocale,
            sourceText: payload.sourceText,
            targetText: payload.targetText,
            matchScore: payload.matchScore,
            reviewStatus: payload.reviewStatus,
            metadata: payload.metadata,
          },
        });

        if (isErr(result)) {
          if (result.error.code === "memory_entry_not_found") {
            return memoryNotFoundResponse(c);
          }
          if (result.error.code === "memory_entry_read_only") {
            return memoryEntryReadOnlyResponse(c, result.error.reason);
          }
          if (result.error.code === "duplicate_memory_entry") {
            return conflictResponse(
              c,
              "duplicate_memory_entry",
              "An entry with this source text and locale pair already exists",
            );
          }

          return apiErrorResponse(
            c,
            409,
            "stale_memory_entry",
            "This entry changed after it was loaded",
            { memoryEntry: toMemoryEntryDetailRecord(result.error.current) },
          );
        }

        const detail = await getMemoryEntryDetail({ memory, entryId: result.value.id });
        if (!detail) {
          return c.json({ memoryEntry: toMemoryEntryRecord(result.value) }, 200);
        }

        return c.json(detail, 200);
      },
    )
    .delete("/:memoryId/entries/:entryId", validateMemoryEntryParams, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }
      if (!isMemoryEntryWritable(memory)) {
        return memoryEntryReadOnlyResponse(
          c,
          memory.capabilityMode === "reference_only" ? "reference_only" : "external_tms",
        );
      }

      const deleted = await db
        .delete(schema.memoryEntries)
        .where(
          and(
            eq(schema.memoryEntries.id, params.entryId),
            eq(schema.memoryEntries.memoryId, memory.id),
          ),
        )
        .returning({ id: schema.memoryEntries.id });

      if (deleted.length === 0) {
        return memoryNotFoundResponse(c);
      }

      return c.body(null, 204);
    })
    .get("/:memoryId/projects", validateMemoryParams, async (c) => {
      const params = c.req.valid("param");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      return c.json({ projects: await listMemoryProjects(c.var.auth, params.memoryId) }, 200);
    })
    .post(
      "/:memoryId/projects",
      validateMemoryParams,
      validateAttachMemoryProjectBody,
      async (c) => {
        if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload: AttachMemoryProjectBody = c.req.valid("json");
        const [memory, project] = await Promise.all([
          memoryStore.getById(c.var.auth, params.memoryId),
          getOwnedProject(c.var.auth, payload.projectId),
        ]);

        if (!memory) {
          return memoryNotFoundResponse(c);
        }
        if (!project) {
          return projectNotFoundResponse(c);
        }

        await db
          .insert(schema.projectMemories)
          .values({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            memoryId: memory.id,
            priority: payload.priority,
          })
          .onConflictDoUpdate({
            target: [schema.projectMemories.projectId, schema.projectMemories.memoryId],
            set: { priority: payload.priority },
          });

        void writeActivityLogEvent({
          actorCredentialId: null,
          actorKind: "user",
          actorUserId: c.var.auth.user.localUserId,
          eventType: "translation_memory_project_attached",
          organizationId: c.var.auth.organization.localOrganizationId,
          payload: { projectId: project.id, resourceId: memory.id },
          targetId: project.id,
          targetKind: "project",
        });

        return c.json({ projects: await listMemoryProjects(c.var.auth, params.memoryId) }, 200);
      },
    )
    .delete("/:memoryId/projects/:projectId", validateMemoryProjectParams, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const [memory, project] = await Promise.all([
        memoryStore.getById(c.var.auth, params.memoryId),
        getOwnedProject(c.var.auth, params.projectId),
      ]);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }
      if (!project) {
        return projectNotFoundResponse(c);
      }

      await db
        .delete(schema.projectMemories)
        .where(
          and(
            eq(schema.projectMemories.organizationId, c.var.auth.organization.localOrganizationId),
            eq(schema.projectMemories.projectId, project.id),
            eq(schema.projectMemories.memoryId, memory.id),
          ),
        );

      void writeActivityLogEvent({
        actorCredentialId: null,
        actorKind: "user",
        actorUserId: c.var.auth.user.localUserId,
        eventType: "translation_memory_project_detached",
        organizationId: c.var.auth.organization.localOrganizationId,
        payload: { projectId: project.id, resourceId: memory.id },
        targetId: project.id,
        targetKind: "project",
      });

      return c.body(null, 204);
    })
    .patch("/:memoryId", validateMemoryParams, validateUpdateMemoryBody, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      if (memory.source === "external_tms") {
        return externalTmsMemoryImmutableResponse(c);
      }

      const updated = await memoryStore.update(c.var.auth, params.memoryId, payload);

      if (!updated) {
        return memoryNotFoundResponse(c);
      }

      return c.json({ memory: toMemoryRecord(updated) }, 200);
    })
    .delete("/:memoryId", validateMemoryParams, async (c) => {
      if (!isMemoryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const memory = await memoryStore.getById(c.var.auth, params.memoryId);

      if (!memory) {
        return memoryNotFoundResponse(c);
      }

      if (memory.source === "external_tms") {
        return externalTmsMemoryImmutableResponse(c);
      }

      const deleted = await memoryStore.delete(c.var.auth, params.memoryId);

      if (!deleted) {
        return memoryNotFoundResponse(c);
      }

      void writeActivityLogEvent({
        actorCredentialId: null,
        actorKind: "user",
        actorUserId: c.var.auth.user.localUserId,
        eventType: "translation_memory_deleted",
        organizationId: c.var.auth.organization.localOrganizationId,
        payload: { resourceId: params.memoryId },
        targetId: params.memoryId,
        targetKind: "translation_memory",
      });

      return c.body(null, 204);
    });
}
