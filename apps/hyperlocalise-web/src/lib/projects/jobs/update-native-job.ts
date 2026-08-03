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
import { and, eq, type SQL } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import { assertAssignableIssueAssignee } from "@/lib/projects/issue-sheet/issue-sheet-assignee";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

export type UpdateNativeJobInput = {
  title?: string;
  description?: string | null;
  ownerWorkosUserId?: string | null;
};

export type UpdateNativeJobError =
  | { code: "job_not_found" }
  | { code: "provider_job_not_updatable"; message: string }
  | { code: "owner_not_found"; message: string }
  | { code: "assignee_not_assignable"; message: string }
  | { code: "project_required"; message: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMetadata(inputPayload: unknown): Record<string, string> {
  if (!isPlainRecord(inputPayload)) {
    return {};
  }
  const metadata = inputPayload.metadata;
  if (!isPlainRecord(metadata)) {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") {
      next[key] = value;
    }
  }
  return next;
}

async function resolveOwnerUserId(input: {
  organizationId: string;
  workosUserId: string;
  database: DatabaseClient;
}): Promise<string | null> {
  const [owner] = await input.database
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(
      schema.organizationMemberships,
      eq(schema.organizationMemberships.userId, schema.users.id),
    )
    .where(
      and(
        eq(schema.users.workosUserId, input.workosUserId),
        eq(schema.organizationMemberships.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return owner?.id ?? null;
}

/** Updates native job title, description, and/or owner. Rejects provider-backed jobs. */
export async function updateNativeJob(input: {
  organizationId: string;
  jobId: string;
  body: UpdateNativeJobInput;
  accessWhere: SQL;
  database?: DatabaseClient;
}): Promise<Result<{ id: string }, UpdateNativeJobError>> {
  const database = input.database ?? db;
  const ownerChanging = Object.hasOwn(input.body, "ownerWorkosUserId");
  const titleChanging = input.body.title !== undefined;
  const descriptionChanging = Object.hasOwn(input.body, "description");

  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: schema.jobs.id,
        projectId: schema.jobs.projectId,
        inputPayload: schema.jobs.inputPayload,
        ownerUserId: schema.jobs.ownerUserId,
        externalProviderKind: schema.externalJobDetails.providerKind,
      })
      .from(schema.jobs)
      .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(and(eq(schema.jobs.id, input.jobId), input.accessWhere))
      .limit(1)
      .for("update");

    if (!existing) {
      return err({ code: "job_not_found" as const });
    }

    if (existing.externalProviderKind) {
      return err({
        code: "provider_job_not_updatable" as const,
        message: "Use the TMS provider job update endpoint for provider-backed jobs",
      });
    }

    if (!existing.projectId) {
      return err({
        code: "project_required" as const,
        message: "Job must belong to a project to update owner or metadata",
      });
    }

    const updates: {
      ownerUserId?: string | null;
      inputPayload?: Record<string, unknown>;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (ownerChanging) {
      if (input.body.ownerWorkosUserId == null) {
        updates.ownerUserId = null;
      } else {
        const resolvedOwnerId = await resolveOwnerUserId({
          organizationId: input.organizationId,
          workosUserId: input.body.ownerWorkosUserId,
          database: tx,
        });
        if (!resolvedOwnerId) {
          return err({
            code: "owner_not_found" as const,
            message: "Assigned owner must be an organization member",
          });
        }

        const assignable = await assertAssignableIssueAssignee({
          organizationId: input.organizationId,
          projectId: existing.projectId,
          assigneeUserId: resolvedOwnerId,
          database: tx,
        });
        if (isErr(assignable)) {
          return err({
            code: "assignee_not_assignable" as const,
            message: "Assigned owner must be an active member with project access",
          });
        }
        updates.ownerUserId = resolvedOwnerId;
      }
    }

    if (titleChanging || descriptionChanging) {
      const currentPayload = isPlainRecord(existing.inputPayload) ? existing.inputPayload : {};
      const metadata = readMetadata(existing.inputPayload);

      if (titleChanging) {
        metadata.title = input.body.title!;
      }

      if (descriptionChanging) {
        if (input.body.description == null || input.body.description.trim().length === 0) {
          delete metadata.description;
        } else {
          metadata.description = input.body.description.trim();
        }
      }

      updates.inputPayload = {
        ...currentPayload,
        metadata,
      };
    }

    const [updated] = await tx
      .update(schema.jobs)
      .set(updates)
      .where(
        and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.organizationId, input.organizationId)),
      )
      .returning({ id: schema.jobs.id });

    if (!updated) {
      return err({ code: "job_not_found" as const });
    }

    return ok(updated);
  });
}
