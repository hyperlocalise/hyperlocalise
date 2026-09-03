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
import "server-only";

import { and, desc, eq, isNull, isNotNull, lte, asc } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

import { resolveNextRunAtForVisualWorkflow } from "./dispatch/schedule";
import {
  resolveVisualWorkflowTriggerFingerprint,
  validateActiveVisualWorkflowTrigger,
} from "./dispatch/trigger-matching";

import { visualWorkflowDefinitionSchema } from "./schema/definition-schema";
import {
  createEmptyVisualWorkflowDefinition,
  fromVisualWorkflowDefinition,
} from "./schema/serializers";
import type { VisualWorkflowDefinition } from "./schema/types";
import { validateVisualWorkflowDefinition } from "./validation/validate-workflow";
import type {
  VisualWorkflowRecord,
  VisualWorkflowStatus,
  VisualWorkflowValidationError,
} from "./visual-workflow-types";

type VisualWorkflowRow = typeof schema.visualWorkflows.$inferSelect;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapVisualWorkflowRow(row: VisualWorkflowRow): VisualWorkflowRecord | null {
  const parsedDefinition = visualWorkflowDefinitionSchema.safeParse(row.definition);
  if (!parsedDefinition.success) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    authorUserId: row.authorUserId,
    projectId: row.projectId,
    status: row.status,
    name: row.name,
    definition: parsedDefinition.data,
    definitionVersion: row.definitionVersion,
    triggerFingerprint: row.triggerFingerprint,
    nextRunAt: row.nextRunAt ? toIsoString(row.nextRunAt) : null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function validateVisualWorkflowPayload(input: {
  name: string;
  definition: VisualWorkflowDefinition;
}): Result<VisualWorkflowDefinition, VisualWorkflowValidationError> {
  const parsed = visualWorkflowDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    return err({
      code: "invalid_definition",
      message: "Workflow definition is invalid.",
    });
  }

  const normalized: VisualWorkflowDefinition = {
    ...parsed.data,
    name: input.name.trim(),
  };

  const issues = validateVisualWorkflowDefinition(normalized);
  if (issues.length > 0) {
    return err({
      code: "invalid_graph",
      issues,
    });
  }

  return ok(normalized);
}

function resolveWorkflowSchedulingMetadata(input: {
  workflowId: string;
  status: VisualWorkflowStatus;
  definition: VisualWorkflowDefinition;
  from?: Date;
}): { triggerFingerprint: string | null; nextRunAt: Date | null } {
  const triggerFingerprint = resolveVisualWorkflowTriggerFingerprint({
    id: input.workflowId,
    definition: input.definition,
  });
  const nextRunAt = resolveNextRunAtForVisualWorkflow(
    { status: input.status, definition: input.definition },
    input.from,
  );
  return { triggerFingerprint, nextRunAt };
}

async function projectExists(input: {
  organizationId: string;
  projectId: string;
  dbClient: DatabaseClient;
}) {
  const [project] = await input.dbClient
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.projectId),
      ),
    )
    .limit(1);

  return Boolean(project);
}

export async function listVisualWorkflows(input: {
  organizationId: string;
  projectId?: string | null;
  status?: VisualWorkflowStatus;
  limit?: number;
  offset?: number;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRecord[]> {
  const dbClient = input.dbClient ?? db;
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const projectId = optionalProjectIdSchema.safeParse(input.projectId).data ?? null;

  const conditions = [eq(schema.visualWorkflows.organizationId, input.organizationId)];
  if (input.status) {
    conditions.push(eq(schema.visualWorkflows.status, input.status));
  }
  if (projectId) {
    conditions.push(eq(schema.visualWorkflows.projectId, projectId));
  } else if (input.projectId === null) {
    conditions.push(isNull(schema.visualWorkflows.projectId));
  }

  const rows = await dbClient
    .select()
    .from(schema.visualWorkflows)
    .where(and(...conditions))
    .orderBy(desc(schema.visualWorkflows.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows
    .map((row) => mapVisualWorkflowRow(row))
    .filter((row): row is VisualWorkflowRecord => row !== null);
}

export async function getVisualWorkflowById(input: {
  organizationId: string;
  visualWorkflowId: string;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRecord | null> {
  const dbClient = input.dbClient ?? db;
  const [row] = await dbClient
    .select()
    .from(schema.visualWorkflows)
    .where(
      and(
        eq(schema.visualWorkflows.organizationId, input.organizationId),
        eq(schema.visualWorkflows.id, input.visualWorkflowId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return mapVisualWorkflowRow(row);
}

export async function createVisualWorkflow(input: {
  organizationId: string;
  authorUserId?: string | null;
  projectId?: string | null;
  name?: string;
  definition?: VisualWorkflowDefinition;
  status?: VisualWorkflowStatus;
  dbClient?: DatabaseClient;
}): Promise<
  Result<VisualWorkflowRecord, VisualWorkflowValidationError | { code: "project_not_found" }>
> {
  const dbClient = input.dbClient ?? db;
  const projectId = optionalProjectIdSchema.safeParse(input.projectId).data ?? null;

  if (projectId) {
    const found = await projectExists({
      organizationId: input.organizationId,
      projectId,
      dbClient,
    });
    if (!found) {
      return err({ code: "project_not_found" });
    }
  }

  const definition =
    input.definition ??
    createEmptyVisualWorkflowDefinition(input.name?.trim() || "Untitled workflow");
  const name = input.name?.trim() || definition.name;

  const validated = validateVisualWorkflowPayload({ name, definition });
  if (isErr(validated)) {
    return validated;
  }

  const status = input.status ?? "draft";

  const [row] = await dbClient
    .insert(schema.visualWorkflows)
    .values({
      organizationId: input.organizationId,
      authorUserId: input.authorUserId ?? null,
      projectId,
      status,
      name: validated.value.name,
      definition: validated.value,
      definitionVersion: 1,
    })
    .returning();

  const scheduling = resolveWorkflowSchedulingMetadata({
    workflowId: row.id,
    status: row.status,
    definition: validated.value,
  });

  const [scheduledRow] = await dbClient
    .update(schema.visualWorkflows)
    .set({
      triggerFingerprint: scheduling.triggerFingerprint,
      nextRunAt: scheduling.nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.visualWorkflows.id, row.id))
    .returning();

  const mapped = mapVisualWorkflowRow(scheduledRow);
  if (!mapped) {
    return err({
      code: "invalid_definition",
      message: "Created workflow definition could not be read back.",
    });
  }

  return ok(mapped);
}

export async function updateVisualWorkflow(input: {
  organizationId: string;
  visualWorkflowId: string;
  name?: string;
  definition?: VisualWorkflowDefinition;
  status?: VisualWorkflowStatus;
  projectId?: string | null;
  dbClient?: DatabaseClient;
}): Promise<
  Result<
    VisualWorkflowRecord,
    | VisualWorkflowValidationError
    | { code: "visual_workflow_not_found" }
    | { code: "project_not_found" }
  >
> {
  const dbClient = input.dbClient ?? db;
  const existing = await getVisualWorkflowById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    dbClient,
  });

  if (!existing) {
    return err({ code: "visual_workflow_not_found" });
  }

  const projectId =
    input.projectId === undefined
      ? existing.projectId
      : (optionalProjectIdSchema.safeParse(input.projectId).data ?? null);

  if (projectId) {
    const found = await projectExists({
      organizationId: input.organizationId,
      projectId,
      dbClient,
    });
    if (!found) {
      return err({ code: "project_not_found" });
    }
  }

  const nextName = input.name?.trim() || existing.name;
  const nextDefinition = input.definition ?? existing.definition;

  const validated = validateVisualWorkflowPayload({
    name: nextName,
    definition: {
      ...nextDefinition,
      name: nextName,
    },
  });
  if (isErr(validated)) {
    return validated;
  }

  const nextStatus = input.status ?? existing.status;
  if (nextStatus === "active") {
    const activeTrigger = validateActiveVisualWorkflowTrigger(validated.value);
    if (!activeTrigger.ok) {
      return err({ code: "invalid_active_trigger", message: activeTrigger.message });
    }
  }

  const definitionChanged = JSON.stringify(existing.definition) !== JSON.stringify(validated.value);
  const scheduling = resolveWorkflowSchedulingMetadata({
    workflowId: existing.id,
    status: nextStatus,
    definition: validated.value,
  });

  const [row] = await dbClient
    .update(schema.visualWorkflows)
    .set({
      name: validated.value.name,
      definition: validated.value,
      status: nextStatus,
      projectId,
      definitionVersion: definitionChanged
        ? existing.definitionVersion + 1
        : existing.definitionVersion,
      triggerFingerprint: scheduling.triggerFingerprint,
      nextRunAt: scheduling.nextRunAt,
    })
    .where(
      and(
        eq(schema.visualWorkflows.organizationId, input.organizationId),
        eq(schema.visualWorkflows.id, input.visualWorkflowId),
      ),
    )
    .returning();

  const mapped = mapVisualWorkflowRow(row);
  if (!mapped) {
    return err({
      code: "invalid_definition",
      message: "Updated workflow definition could not be read back.",
    });
  }

  return ok(mapped);
}

export function visualWorkflowEditorStateFromRecord(record: VisualWorkflowRecord) {
  return fromVisualWorkflowDefinition({
    ...record.definition,
    name: record.name,
  });
}

export async function listDueScheduledVisualWorkflows(input: {
  now?: Date;
  limit?: number;
  organizationId?: string;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRecord[]> {
  const dbClient = input.dbClient ?? db;
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;

  const rows = await dbClient
    .select()
    .from(schema.visualWorkflows)
    .where(
      and(
        eq(schema.visualWorkflows.status, "active"),
        isNotNull(schema.visualWorkflows.nextRunAt),
        lte(schema.visualWorkflows.nextRunAt, now),
        ...(input.organizationId
          ? [eq(schema.visualWorkflows.organizationId, input.organizationId)]
          : []),
      ),
    )
    .orderBy(asc(schema.visualWorkflows.nextRunAt), asc(schema.visualWorkflows.id))
    .limit(limit);

  return rows
    .map((row) => mapVisualWorkflowRow(row))
    .filter((row): row is VisualWorkflowRecord => row !== null)
    .filter((workflow) => {
      const trigger = workflow.definition.nodes.find((node) => node.type === "trigger.scheduled");
      return Boolean(trigger);
    });
}

export async function advanceVisualWorkflowNextRun(input: {
  visualWorkflowId: string;
  organizationId: string;
  completedAt?: Date;
  dbClient?: DatabaseClient;
}) {
  const dbClient = input.dbClient ?? db;
  const workflow = await getVisualWorkflowById({
    visualWorkflowId: input.visualWorkflowId,
    organizationId: input.organizationId,
    dbClient,
  });
  if (!workflow) {
    return;
  }

  const nextRunAt = resolveNextRunAtForVisualWorkflow(
    { status: workflow.status, definition: workflow.definition },
    input.completedAt ?? new Date(),
  );

  await dbClient
    .update(schema.visualWorkflows)
    .set({
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.visualWorkflows.id, input.visualWorkflowId),
        eq(schema.visualWorkflows.organizationId, input.organizationId),
      ),
    );
}
