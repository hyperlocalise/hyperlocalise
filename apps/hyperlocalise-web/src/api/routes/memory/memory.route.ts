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

import { and, count, desc, eq } from "drizzle-orm";

import {
  buildAccessibleProjectsWhere,
  buildProjectLinkedMemoryWhere,
} from "@/api/auth/team-access";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import {
  conflictResponse,
  badRequestResponse,
  validationErrorResponse,
} from "@/api/errors";
import { apiErrorResponse } from "@/api/response.schema";
import { isErr } from "@/lib/primitives/result/results";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { db, schema } from "@/lib/database";
import type { Memory } from "@/lib/database/types";
import { toMemoryRecord } from "@/lib/memory/memory-records";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";
import { promoteApprovedProjectTranslationsToMemory } from "@/lib/projects/translations/project-translation-service";

import { getOwnedProject, projectNotFoundResponse } from "../project/project.shared";
import {
  attachMemoryProjectBodySchema,
  createMemoryEntryBodySchema,
  createMemoryBodySchema,
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
  type ImportMemoryEntriesBody,
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
  recordMemoryEntryCreatedEvents,
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
    const where = await buildProjectLinkedMemoryWhere(auth);

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
    const deletedMemories = await db
      .delete(schema.memories)
      .where(await ownedMemoryWhere(auth, memoryId))
      .returning({ id: schema.memories.id });

    return deletedMemories.length > 0;
  },
};

function toMemoryEntryRecord(entry: MemoryEntry): MemoryEntryRecord {
  return toMemoryEntryDetailRecord(entry);
}

function parseMemoryImport(payload: ImportMemoryEntriesBody): CreateMemoryEntryBody[] {
  if (payload.format === "csv") {
    const rows = parseCsvRows(payload.content);
    const [first, ...rest] = rows;
    const hasHeader = first?.some((cell) => /source|target|locale|text/i.test(cell)) ?? false;
    const dataRows = hasHeader ? rest : rows;

    return dataRows.flatMap((row) => {
      const [sourceLocale, targetLocale, sourceText, targetText, score] = row;
      const rawScore = score ? Number.parseInt(score, 10) : 100;
      const matchScore = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, rawScore)) : 100;
      return sourceLocale && targetLocale && sourceText && targetText
        ? [
            {
              sourceLocale,
              targetLocale,
              sourceText,
              targetText,
              matchScore,
            },
          ]
        : [];
    });
  }

  const units = [...payload.content.matchAll(/<tu\b[\s\S]*?<\/tu>/gi)];
  return units.flatMap((unit) => {
    const variants = [
      ...unit[0].matchAll(/<tuv\b[^>]*?xml:lang=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tuv>/gi),
    ];
    if (variants.length < 2) {
      return [];
    }

    const [source, target] = variants;
    const sourceText = source[2]
      ?.match(/<seg\b[^>]*>([\s\S]*?)<\/seg>/i)?.[1]
      ?.replace(/[<>]/g, "")
      .trim();
    const targetText = target[2]
      ?.match(/<seg\b[^>]*>([\s\S]*?)<\/seg>/i)?.[1]
      ?.replace(/[<>]/g, "")
      .trim();

    return source[1] && target[1] && sourceText && targetText
      ? [
          {
            sourceLocale: source[1],
            targetLocale: target[1],
            sourceText,
            targetText,
            matchScore: 100,
          },
        ]
      : [];
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

  const [entry] = await db
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

  await recordMemoryEntryCreatedEvent({ entry, actorUserId: createdByUserId });
  return entry;
}

async function createMemoryEntries(
  memory: Memory,
  payloads: CreateMemoryEntryBody[],
  options?: { createdByUserId?: string; importBatchId?: string },
): Promise<MemoryEntry[]> {
  if (payloads.length === 0) {
    return [];
  }

  const created = await db
    .insert(schema.memoryEntries)
    .values(
      payloads.map((payload) => ({
        memoryId: memory.id,
        sourceLocale: payload.sourceLocale,
        targetLocale: payload.targetLocale,
        sourceText: payload.sourceText,
        normalizedSourceText: normalizeTranslationMemorySourceText(payload.sourceText),
        targetText: payload.targetText,
        matchScore: payload.matchScore,
        provenance: "import",
        createdByUserId: options?.createdByUserId,
        importBatchId: options?.importBatchId,
      })),
    )
    .onConflictDoNothing()
    .returning();

  await recordMemoryEntryCreatedEvents({
    entries: created,
    actorUserId: options?.createdByUserId,
  });
  return created;
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

        const entries = parseMemoryImport(payload);
        const limitedEntries = entries.slice(0, 5_000);
        const importBatchId = randomUUID();
        const created = await createMemoryEntries(memory, limitedEntries, {
          createdByUserId: c.var.auth.user.localUserId,
          importBatchId,
        });
        const skipped = limitedEntries.length - created.length;

        return c.json(
          {
            memoryEntries: created.map(toMemoryEntryRecord),
            imported: created.length,
            skipped,
            importBatchId,
          },
          201,
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

      return c.body(null, 204);
    });
}
