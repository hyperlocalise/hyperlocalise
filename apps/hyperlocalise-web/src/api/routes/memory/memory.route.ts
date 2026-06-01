import { and, count, desc, eq, ne } from "drizzle-orm";

import { buildProjectLinkedMemoryWhere } from "@/api/auth/team-access";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { conflictResponse } from "@/api/errors";
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { db, schema } from "@/lib/database";
import type { Memory } from "@/lib/database/types";
import { toMemoryRecord } from "@/lib/memory/memory-records";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import { getOwnedProject, projectNotFoundResponse } from "../project/project.shared";
import {
  attachMemoryProjectBodySchema,
  createMemoryEntryBodySchema,
  createMemoryBodySchema,
  importMemoryEntriesBodySchema,
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
  type ListMemoryEntriesQuery,
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
  memoryNotFoundResponse,
} from "./memory.shared";

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

type MemoryEntryRecord = {
  id: string;
  memoryId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  matchScore: number;
  provenance: string;
  reviewStatus: string;
  externalKey: string | null;
  createdAt: string;
  updatedAt: string;
};

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
  return {
    id: entry.id,
    memoryId: entry.memoryId,
    sourceLocale: entry.sourceLocale,
    targetLocale: entry.targetLocale,
    sourceText: entry.sourceText,
    targetText: entry.targetText,
    matchScore: entry.matchScore,
    provenance: entry.provenance,
    reviewStatus: entry.reviewStatus,
    externalKey: entry.externalKey,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
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

async function listMemoryEntries(memoryId: string, query?: ListMemoryEntriesQuery) {
  const limit = query?.limit ?? 50;
  const offset = query?.offset ?? 0;
  const conditions = [eq(schema.memoryEntries.memoryId, memoryId)];
  if (query?.sourceLocale)
    conditions.push(eq(schema.memoryEntries.sourceLocale, query.sourceLocale));
  if (query?.targetLocale)
    conditions.push(eq(schema.memoryEntries.targetLocale, query.targetLocale));
  const where = and(...conditions);

  const [entries, totalRow] = await Promise.all([
    db
      .select()
      .from(schema.memoryEntries)
      .where(where)
      .orderBy(desc(schema.memoryEntries.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.memoryEntries).where(where),
  ]);

  return { entries, total: totalRow[0]?.value ?? 0 };
}

async function createMemoryEntry(
  memory: Memory,
  payload: CreateMemoryEntryBody,
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
    })
    .onConflictDoNothing()
    .returning();

  return entry ?? null;
}

async function createMemoryEntries(
  memory: Memory,
  payloads: CreateMemoryEntryBody[],
): Promise<MemoryEntry[]> {
  if (payloads.length === 0) {
    return [];
  }

  return db
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
        provenance: "manual",
      })),
    )
    .onConflictDoNothing()
    .returning();
}

async function listMemoryProjects(
  auth: ApiAuthContext,
  memoryId: string,
): Promise<MemoryProjectRecord[]> {
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

      const { entries, total } = await listMemoryEntries(params.memoryId, query);
      return c.json({ memoryEntries: entries.map(toMemoryEntryRecord), total }, 200);
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
      if (memory.source === "external_tms") {
        return externalTmsMemoryImmutableResponse(c);
      }

      const entry = await createMemoryEntry(memory, payload);
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
        if (memory.source === "external_tms") {
          return externalTmsMemoryImmutableResponse(c);
        }

        const entries = parseMemoryImport(payload);
        const limitedEntries = entries.slice(0, 5_000);
        const created = await createMemoryEntries(memory, limitedEntries);
        const skipped = limitedEntries.length - created.length;

        return c.json(
          { memoryEntries: created.map(toMemoryEntryRecord), imported: created.length, skipped },
          201,
        );
      },
    )
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
        if (memory.source === "external_tms") {
          return externalTmsMemoryImmutableResponse(c);
        }

        const [existingEntry] = await db
          .select()
          .from(schema.memoryEntries)
          .where(
            and(
              eq(schema.memoryEntries.id, params.entryId),
              eq(schema.memoryEntries.memoryId, memory.id),
            ),
          )
          .limit(1);

        if (!existingEntry) {
          return memoryNotFoundResponse(c);
        }

        const updates: Partial<typeof schema.memoryEntries.$inferInsert> = { ...payload };
        if (payload.sourceText !== undefined) {
          updates.normalizedSourceText = normalizeTranslationMemorySourceText(payload.sourceText);
        }

        if (
          payload.sourceText !== undefined ||
          payload.sourceLocale !== undefined ||
          payload.targetLocale !== undefined
        ) {
          const normalizedSourceText =
            updates.normalizedSourceText ?? existingEntry.normalizedSourceText;
          const duplicate = await db
            .select({ id: schema.memoryEntries.id })
            .from(schema.memoryEntries)
            .where(
              and(
                eq(schema.memoryEntries.memoryId, memory.id),
                eq(
                  schema.memoryEntries.sourceLocale,
                  payload.sourceLocale ?? existingEntry.sourceLocale,
                ),
                eq(
                  schema.memoryEntries.targetLocale,
                  payload.targetLocale ?? existingEntry.targetLocale,
                ),
                eq(schema.memoryEntries.normalizedSourceText, normalizedSourceText),
                ne(schema.memoryEntries.id, params.entryId),
              ),
            )
            .limit(1);

          if (duplicate.length > 0) {
            return conflictResponse(
              c,
              "duplicate_memory_entry",
              "An entry with this source text and locale pair already exists",
            );
          }
        }

        const [entry] = await db
          .update(schema.memoryEntries)
          .set(updates)
          .where(
            and(
              eq(schema.memoryEntries.id, params.entryId),
              eq(schema.memoryEntries.memoryId, memory.id),
            ),
          )
          .returning();

        if (!entry) {
          return memoryNotFoundResponse(c);
        }

        return c.json({ memoryEntry: toMemoryEntryRecord(entry) }, 200);
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
      if (memory.source === "external_tms") {
        return externalTmsMemoryImmutableResponse(c);
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
