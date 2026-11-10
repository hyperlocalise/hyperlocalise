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
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { buildProjectLinkedMemoryWhere } from "@/api/auth/team-access";
import { Hono, type Context } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse } from "@/api/response.schema";
import { apiErrorResponse } from "@/api/response.schema";
import { isErr } from "@/lib/primitives/result/results";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database/client";
import type { Memory } from "@/lib/database/types";
import { enqueueActivityLogEvent } from "@/lib/activity-log/activity-log-writer";
import {
  getMemoryImportAttempt,
  listMemoryImportAttempts,
} from "@/lib/memory/memory-import-attempts";
import { toMemoryRecord, toVirtualMemoryRecord } from "@/lib/memory/memory-records";
import {
  capabilityDeniedReason,
  isMemoryCapabilityAllowed,
  resolveMemoryCapabilities,
  type MemoryCapabilityAction,
} from "@/lib/memory/memory-capabilities";

import { getOwnedProject } from "../project/project.shared";
import {
  bulkDeleteMemoryEntriesBodySchema,
  bulkReviewMemoryEntriesBodySchema,
  memoryIdParamsSchema,
  memoryImportAttemptParamsSchema,
  type CreateMemoryBody,
  type MemoryImportAttemptRecord,
  type BulkDeleteMemoryEntriesBody,
  type BulkReviewMemoryEntriesBody,
  type ListMemoryQuery,
  type UpdateMemoryBody,
} from "./memory.schema";
import {
  invalidMemoryPayloadResponse,
  getOwnedMemory,
  ownedMemoryWhere,
  memoryEntryReadOnlyResponse,
  memoryCapabilityDeniedResponse,
  memoryNotFoundResponse,
} from "./memory.shared";
import {
  bulkDeleteMemoryEntries,
  bulkReviewMemoryEntries,
  getMemoryEntryReviewSummary,
} from "@/lib/memory/memory-entry-review";

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

type MemoryRouteContext = Context<{ Variables: AuthVariables }>;

async function requireMemoryCapability(
  c: MemoryRouteContext,
  memoryId: string,
  action: MemoryCapabilityAction,
) {
  const resolved = await resolveMemoryCapabilities(c.var.auth, memoryId);
  if (resolved.kind === "not_found") {
    return { response: memoryNotFoundResponse(c) } as const;
  }
  if (resolved.kind === "unavailable") {
    return {
      response: apiErrorResponse(c, 503, "memory_unavailable", "Translation memory unavailable"),
    } as const;
  }
  if (!isMemoryCapabilityAllowed(resolved.value.capabilities, action)) {
    await enqueueActivityLogEvent({
      actorCredentialId: null,
      actorKind: "user",
      actorUserId: c.var.auth.user.localUserId,
      eventType: "translation_memory_action_rejected",
      organizationId: c.var.auth.organization.localOrganizationId,
      payload: {
        action,
        reason: capabilityDeniedReason(resolved.value.capabilities, action),
        resourceId: resolved.value.resource.id,
      },
      targetId: resolved.value.resource.id,
      targetKind: "translation_memory",
    });
    return {
      response: memoryCapabilityDeniedResponse(
        c,
        action,
        capabilityDeniedReason(resolved.value.capabilities, action),
      ),
    } as const;
  }
  return { value: resolved.value } as const;
}

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
    const sourceWhere = query?.source ? eq(schema.memories.source, query.source) : undefined;
    const where = and(
      accessWhere,
      projectMemoryIds ? inArray(schema.memories.id, projectMemoryIds) : undefined,
      sourceWhere,
    );

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

function toMemoryImportAttemptRecord(
  attempt: Awaited<ReturnType<typeof listMemoryImportAttempts>>["attempts"][number],
): MemoryImportAttemptRecord {
  return {
    id: attempt.id,
    organizationId: attempt.organizationId,
    memoryId: attempt.memoryId,
    createdByUserId: attempt.createdByUserId,
    actorDisplayName: attempt.actorDisplayName,
    operation: attempt.operation,
    status: attempt.status,
    importBatchId: attempt.id,
    format: attempt.format,
    options: attempt.options,
    sourceFilename: attempt.sourceFilename,
    sourceByteSize: attempt.sourceByteSize,
    sourceSha256: attempt.sourceSha256,
    counts: attempt.counts,
    resultFilename: attempt.resultFilename,
    resultReady: Boolean(attempt.resultObjectKey?.trim()),
    headerSrclang: attempt.headerSrclang,
    diagnosticsTruncated: attempt.diagnosticsTruncated,
    diagnosticsAvailability: attempt.diagnosticsAvailability,
    diagnosticsExpiresAt: attempt.diagnosticsExpiresAt?.toISOString() ?? null,
    retentionPolicy: "indefinite",
    failureCode: attempt.failureCode,
    failureMessage: attempt.failureMessage,
    createdAt: attempt.createdAt.toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
  };
}

const validateMemoryParams = validator("param", (value, c) => {
  const parsed = memoryIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return memoryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateMemoryImportAttemptParams = validator("param", (value, c) => {
  const parsed = memoryImportAttemptParamsSchema.safeParse(value);

  if (!parsed.success) {
    return memoryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateBulkReviewMemoryEntriesBody = validator("json", (value, c) => {
  const parsed = bulkReviewMemoryEntriesBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

const validateBulkDeleteMemoryEntriesBody = validator("json", (value, c) => {
  const parsed = bulkDeleteMemoryEntriesBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidMemoryPayloadResponse(c);
  }

  return parsed.data;
});

export function createMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/:memoryId", validateMemoryParams, async (c) => {
      const params = c.req.valid("param");
      const resolved = await resolveMemoryCapabilities(c.var.auth, params.memoryId);

      if (resolved.kind === "not_found") {
        return memoryNotFoundResponse(c);
      }
      if (resolved.kind === "unavailable") {
        return apiErrorResponse(c, 503, "memory_unavailable", "Translation memory unavailable");
      }

      const { resource, capabilities } = resolved.value;
      return c.json(
        {
          memory: resource.persistedMemory
            ? toMemoryRecord(resource.persistedMemory, capabilities)
            : toVirtualMemoryRecord(resource, capabilities),
        },
        200,
      );
    })
    .get(
      "/:memoryId/import-attempts/:attemptId/report",
      validateMemoryImportAttemptParams,
      async (c) => {
        const params = c.req.valid("param");
        const memory = await memoryStore.getById(c.var.auth, params.memoryId);
        if (!memory) return memoryNotFoundResponse(c);
        const result = await getMemoryImportAttempt({
          organizationId: c.var.auth.organization.localOrganizationId,
          memoryId: memory.id,
          attemptId: params.attemptId,
          operation: "import",
        });
        if (!result) return memoryNotFoundResponse(c);

        const body = JSON.stringify(
          {
            memoryImportAttempt: toMemoryImportAttemptRecord(result.attempt),
            diagnostics: result.diagnostics,
          },
          null,
          2,
        );
        return c.body(body, 200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`tm-import-report-${result.attempt.id}.json`)}`,
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; sandbox;",
          "X-Content-Type-Options": "nosniff",
          "X-Download-Options": "noopen",
        });
      },
    )
    .get("/:memoryId/entries/review-summary", validateMemoryParams, async (c) => {
      const params = c.req.valid("param");
      const resolved = await resolveMemoryCapabilities(c.var.auth, params.memoryId);
      if (resolved.kind !== "resolved") {
        if (resolved.kind === "unavailable") {
          return apiErrorResponse(c, 503, "memory_unavailable", "Translation memory unavailable");
        }
        return memoryNotFoundResponse(c);
      }

      const memory = resolved.value.resource.persistedMemory;
      if (!memory) {
        return c.json({ reviewSummary: { pending: 0, rejected: 0, sameAsSource: 0 } }, 200);
      }

      return c.json({ reviewSummary: await getMemoryEntryReviewSummary(memory.id) }, 200);
    })
    .post(
      "/:memoryId/entries/bulk-review",
      validateMemoryParams,
      validateBulkReviewMemoryEntriesBody,
      async (c) => {
        const params = c.req.valid("param");
        const payload: BulkReviewMemoryEntriesBody = c.req.valid("json");
        const access = await requireMemoryCapability(c, params.memoryId, "review");
        if ("response" in access) return access.response;
        const memory = access.value.resource.persistedMemory;
        if (!memory) return memoryCapabilityDeniedResponse(c, "review", "unsupported");

        const result = await bulkReviewMemoryEntries({
          memory,
          entries: payload.entries,
          reviewStatus: payload.reviewStatus,
          actorUserId: c.var.auth.user.localUserId,
        });

        if (isErr(result)) {
          if (result.error.code === "memory_entry_read_only") {
            return memoryEntryReadOnlyResponse(c, result.error.reason);
          }
          if (result.error.code === "stale_memory_entry") {
            return apiErrorResponse(
              c,
              409,
              "stale_memory_entry",
              "A selected entry changed after it was loaded",
            );
          }
          return badRequestResponse(
            c,
            result.error.code,
            result.error.code === "selection_too_large"
              ? "Select at most 100 translation memory entries"
              : "Select at least one translation memory entry",
          );
        }

        return c.json({ bulkReview: { updated: result.value.updated } }, 200);
      },
    )
    .post(
      "/:memoryId/entries/bulk-delete",
      validateMemoryParams,
      validateBulkDeleteMemoryEntriesBody,
      async (c) => {
        const params = c.req.valid("param");
        const payload: BulkDeleteMemoryEntriesBody = c.req.valid("json");
        const access = await requireMemoryCapability(c, params.memoryId, "bulk_mutation");
        if ("response" in access) return access.response;
        const memory = access.value.resource.persistedMemory;
        if (!memory) return memoryCapabilityDeniedResponse(c, "bulk_mutation", "unsupported");

        const result = await bulkDeleteMemoryEntries({
          memory,
          entryIds: payload.entryIds,
        });

        if (isErr(result)) {
          if (result.error.code === "memory_entry_read_only") {
            return memoryEntryReadOnlyResponse(c, result.error.reason);
          }
          return badRequestResponse(
            c,
            result.error.code,
            result.error.code === "selection_too_large"
              ? "Select at most 100 translation memory entries"
              : "Select at least one translation memory entry",
          );
        }

        return c.json({ bulkDelete: { deleted: result.value.deleted } }, 200);
      },
    );
}
