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
import {
  and,
  arrayContains,
  count,
  eq,
  inArray,
  isNotNull,
  sql,
  TransactionRollbackError,
  type SQL,
} from "drizzle-orm";

import { maxKeyJobStrings, type KeysTranslationJobInput } from "@/api/routes/project/job.schema";
import { db, schema, type DatabaseTransaction } from "@/lib/database/client";
import { updateJobs } from "@/lib/job-change-events/job-writes";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type KeyJobSelectionError = { code: "no_strings_matched" | "too_many_strings" };

/** Thrown inside a create transaction so the job is rolled back with its keys. */
export class KeyJobSelectionFailure extends Error {
  constructor(readonly selectionError: KeyJobSelectionError) {
    super(selectionError.code);
  }
}

export const keyJobSelectionMessages: Record<KeyJobSelectionError["code"], string> = {
  no_strings_matched: "No visible strings in the project's files match the selection",
  too_many_strings: `A key job holds at most ${maxKeyJobStrings.toLocaleString("en-US")} strings`,
};

function withoutWorkflowTaskStep(metadata: Record<string, string>) {
  const { workflowTaskStep: _ignored, ...rest } = metadata;
  return rest;
}

/** The stored input of a key job: its languages and metadata, without the selection. */
export function keyJobInputPayload(input: KeysTranslationJobInput) {
  return {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    ...(input.overwriteUnapproved ? { overwriteUnapproved: true } : {}),
    // A visual workflow step name would hide Mark done, so a key job never carries one.
    ...(input.metadata ? { metadata: withoutWorkflowTaskStep(input.metadata) } : {}),
  };
}

/**
 * Links the selected visible strings of the project's files to a new key job. Hidden strings
 * are left out, as translation jobs skip them, and so are strings in no file.
 */
export async function insertKeyJobKeys(
  tx: DatabaseTransaction,
  input: {
    organizationId: string;
    projectId: string;
    jobId: string;
    selection: Pick<KeysTranslationJobInput, "stringIds" | "keys" | "tags">;
  },
): Promise<Result<number, KeyJobSelectionError>> {
  const keys = schema.projectTranslationKeys;
  const { stringIds, keys: keyNames, tags } = input.selection;
  const rows = await tx
    .select({ id: keys.id })
    .from(keys)
    .where(
      and(
        eq(keys.organizationId, input.organizationId),
        eq(keys.projectId, input.projectId),
        eq(keys.isHidden, false),
        // The content editor only shows strings that belong to a file.
        isNotNull(keys.repositorySourceFileId),
        stringIds ? inArray(keys.id, stringIds) : undefined,
        keyNames ? inArray(keys.key, keyNames) : undefined,
        tags ? arrayContains(keys.tags, tags) : undefined,
      ),
    )
    .limit(maxKeyJobStrings + 1);

  if (rows.length === 0) {
    return err({ code: "no_strings_matched" });
  }
  if (rows.length > maxKeyJobStrings) {
    return err({ code: "too_many_strings" });
  }

  await tx
    .insert(schema.translationJobKeys)
    .values(rows.map((row) => ({ jobId: input.jobId, translationKeyId: row.id })));
  return ok(rows.length);
}

const maxListedTags = 500;

/** The tags used on a project's keys, for the content editor's label filter. */
export async function listProjectKeyTags(organizationId: string, projectId: string) {
  const rows = await db
    .selectDistinct({ tag: sql<string>`unnest(${schema.projectTranslationKeys.tags})` })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, organizationId),
        eq(schema.projectTranslationKeys.projectId, projectId),
      ),
    )
    .orderBy(sql`1`)
    .limit(maxListedTags);
  return rows.map((row) => row.tag);
}

export type AddKeyJobStringsError =
  | KeyJobSelectionError
  | { code: "job_not_found" | "not_key_job" | "job_not_open" };

/**
 * Adds visible strings in the files of the job's project to an open key job, returning how
 * many were new.
 * The job row is locked so concurrent adds count the limit correctly.
 */
export async function addKeyJobStrings(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
  stringIds: string[];
  accessWhere: SQL | undefined;
}): Promise<Result<number, AddKeyJobStringsError>> {
  return db
    .transaction(async (tx): Promise<Result<number, AddKeyJobStringsError>> => {
      const [job] = await tx
        .select({ status: schema.jobs.status, type: schema.translationJobDetails.type })
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(
          and(
            eq(schema.jobs.id, input.jobId),
            eq(schema.jobs.organizationId, input.organizationId),
            eq(schema.jobs.projectId, input.projectId),
            input.accessWhere,
          ),
        )
        .for("update", { of: schema.jobs })
        .limit(1);

      if (!job) {
        return err({ code: "job_not_found" });
      }
      if (job.type !== "keys") {
        return err({ code: "not_key_job" });
      }
      if (job.status !== "waiting_for_review") {
        return err({ code: "job_not_open" });
      }

      const keys = schema.projectTranslationKeys;
      const visible = await tx
        .select({ id: keys.id })
        .from(keys)
        .where(
          and(
            eq(keys.organizationId, input.organizationId),
            eq(keys.projectId, input.projectId),
            eq(keys.isHidden, false),
            isNotNull(keys.repositorySourceFileId),
            inArray(keys.id, input.stringIds),
          ),
        );
      if (visible.length === 0) {
        return err({ code: "no_strings_matched" });
      }

      const added = await tx
        .insert(schema.translationJobKeys)
        .values(visible.map((row) => ({ jobId: input.jobId, translationKeyId: row.id })))
        .onConflictDoNothing()
        .returning({ id: schema.translationJobKeys.translationKeyId });
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(schema.translationJobKeys)
        .where(eq(schema.translationJobKeys.jobId, input.jobId));
      if (total > maxKeyJobStrings) {
        tx.rollback();
      }
      await updateJobs(tx, {
        set: { updatedAt: new Date() },
        where: eq(schema.jobs.id, input.jobId),
      });
      return ok(added.length);
    })
    .catch((error: unknown) => {
      // Rolled back above when the add would pass the string limit.
      if (error instanceof TransactionRollbackError) {
        return err<number, AddKeyJobStringsError>({ code: "too_many_strings" });
      }
      throw error;
    });
}

/**
 * How many visible strings a key job holds, null for other jobs, as go-svc's job reads return
 * it. Hidden strings stay in the job but are left out, as in its editor view and progress.
 */
export const keyJobKeyCountSql = sql<
  number | null
>`case when ${schema.translationJobDetails.type} = 'keys'
  then (select count(*)::int from ${schema.translationJobKeys}
    join ${schema.projectTranslationKeys}
      on ${schema.projectTranslationKeys.id} = ${schema.translationJobKeys.translationKeyId}
      and ${schema.projectTranslationKeys.isHidden} = false
    where ${schema.translationJobKeys.jobId} = ${schema.jobs.id}) end`;
