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
import { and, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { isErr } from "@/lib/primitives/result/results";
import { DEFAULT_PROJECT_BRANCH_NAME } from "@/lib/projects/branches/project-branch-name";
import {
  isTranslationSourceDestination,
  sendTranslationAsSource,
  type TranslationAsSourceError,
} from "@/lib/projects/files/translation-as-source";
import {
  getTranslationAsSourceDestinationFile,
  translationAsSourceDestinationPath,
} from "@/lib/projects/files/translation-as-source-destination";
import { translationSourceFingerprintSql } from "@/lib/projects/files/translation-as-source-fingerprint";
import { TRANSLATION_AS_SOURCE_UPLOAD_SURFACE } from "@/lib/projects/files/translation-as-source-support";

import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

function failure(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code, message } };
}

/** Why nothing was sent when nothing should be: later steps can branch on it. */
type Refusal =
  | "already_sent"
  | "not_on_default_branch"
  | "sent_from_destination"
  | "task_has_no_file"
  | "task_in_other_language"
  | "source_file_not_found"
  | "unsupported_file_format"
  | "no_strings";

/**
 * Send errors a person must act on (a setting, the file's translations, the other project) or
 * storage failing. They fail the step, so the run shows as failed and can be retried once fixed.
 */
type FailureCode = Exclude<TranslationAsSourceError["code"], Refusal>;

const FAILURE_MESSAGES: Record<Exclude<FailureCode, "translations_not_approved">, string> = {
  same_project: "Choose another project to send the file to.",
  project_not_native:
    "Both projects must store their files in the workspace, not in a connected TMS.",
  locale_not_a_target: "Choose a project whose source language is one of this project's languages.",
  destination_source_locale_mismatch:
    "Choose a project whose source language is one of this project's languages.",
  destination_file_replaced:
    "The project to send to has a file at this path that this file did not send. On the Files page, open this file's menu, select Use translation as source… and replace it once.",
  destination_branch_protected:
    "The project to send to has a protected default branch, so the file cannot be added to it. Once it is unprotected, retry the run or send the file from the Files page.",
  source_file_not_ready:
    "The file's newest upload is still being read. Once it has been read, retry the run or send the file from the Files page.",
  source_file_read_failed:
    "The file's newest upload could not be read. Upload it again, then retry the run or send the file from the Files page.",
  file_reads_differently:
    "The project to send to would read the translated file as different strings. Use translation as source… on the Files page says why.",
  file_cannot_be_written: "The file could not be written in that language.",
  file_build_failed: "Could not build the file. Try again.",
  upload_failed: "Could not store the file in the project to send to. Try again.",
};

const REFUSAL_MESSAGES: Record<Refusal, string> = {
  already_sent: "The project to send to already has this file with these translations.",
  sent_from_destination:
    "The file's content came from the project to send to, so it is not sent back.",
  task_has_no_file: "The task is not about one file, so there is nothing to send.",
  task_in_other_language:
    "The task is not in the source language of the project to send to, so nothing was sent for it.",
  source_file_not_found: "The task's file is not in the project any more.",
  unsupported_file_format: "Only Word and Excel files can be sent to another project.",
  no_strings: "The file has no strings to send.",
  not_on_default_branch:
    "The file is on another branch of the project. Only files on the default branch are sent.",
};

/** Exported for tests. */
export function isRefusal(
  code: TranslationAsSourceError["code"],
): code is Extract<TranslationAsSourceError["code"], Refusal> {
  return Object.hasOwn(REFUSAL_MESSAGES, code);
}

function sendFailure(error: TranslationAsSourceError, locale: string) {
  if (error.code === "translations_not_approved") {
    const one = error.missingCount === 1;
    return failure(
      error.code,
      `${error.missingCount} ${one ? "string has" : "strings have"} no approved translation in ${locale}. Approve ${one ? "it" : "them"}, then retry the run or send the file from the Files page.`,
    );
  }
  return failure(
    error.code,
    FAILURE_MESSAGES[error.code as Exclude<FailureCode, "translations_not_approved">],
  );
}

/**
 * Whether the newest version of `repositorySourceFileId` was built, directly or through other
 * projects, from a file of `projectId`. Sending it there would send that project's own content
 * back to it, and two workflows sending each way would never stop.
 */
async function isBuiltFromProject(input: {
  organizationId: string;
  repositorySourceFileId: string;
  projectId: string;
}): Promise<boolean> {
  const result = await db.execute<{ found: boolean }>(sql`
    with recursive chain(version_id, project_id, depth) as (
      (
        select newest.id, newest.project_id, 0
        from repository_source_file_versions newest
        where newest.repository_source_file_id = ${input.repositorySourceFileId}
          and newest.organization_id = ${input.organizationId}
        order by newest.created_at desc
        limit 1
      )
      union all
      select origin.id, origin.project_id, chain.depth + 1
      from chain
      join repository_source_file_versions version on version.id = chain.version_id
      join stored_files stored on stored.id = version.stored_file_id
      join repository_source_file_versions origin
        on origin.id = (stored.metadata -> 'translationSource' ->> 'sourceFileVersionId')::uuid
      where version.upload_surface = ${TRANSLATION_AS_SOURCE_UPLOAD_SURFACE}
        and origin.organization_id = ${input.organizationId}
        and chain.depth < 20
    )
    select exists (
      select 1 from chain where depth > 0 and project_id = ${input.projectId}
    ) as found
  `);
  return result.rows[0]?.found ?? false;
}

/**
 * The Use translation as source step: sends a task's file, with its approved translation, to the
 * destination as its source file, through the same send a person makes, with no person behind
 * it. So it never replaces a file there that this file did not send. A refusal is the step's
 * output, with `sent: false`; a setting that cannot work and a failure to build or store the
 * file fail it. A task with no file, or not in the destination's source language, is a refusal,
 * since the Job changed trigger fires for every matching task of the project.
 */
export async function runTranslationAsSourceAction(
  input: Omit<Parameters<typeof sendFileAsSource>[0], "projectId" | "sourceFileId"> & {
    jobId: string;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.destinationProjectId) {
    return failure("missing_translation_as_source_config", "Choose the project to send to.");
  }
  if (!input.jobId) {
    return failure(
      "missing_translation_as_source_config",
      "Set Job ID, for example {{ trigger.jobId }} from a Job changed trigger.",
    );
  }
  const [job] = await db
    .select({ projectId: schema.jobs.projectId, inputPayload: schema.jobs.inputPayload })
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.organizationId, input.organizationId), eq(schema.jobs.id, input.jobId)),
    )
    .limit(1);
  if (!job) {
    return failure("job_not_found", "The task to send from was not found.");
  }
  const { sourceFileId, targetLocales } = (job.inputPayload ?? {}) as {
    sourceFileId?: unknown;
    targetLocales?: unknown;
  };
  const [destination] = await db
    .select({ sourceLocale: schema.projects.sourceLocale })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, input.destinationProjectId),
      ),
    )
    .limit(1);
  const refused = (
    reason: "task_has_no_file" | "task_in_other_language",
  ): VisualWorkflowNodeExecutionResult => ({
    ok: true,
    output: {
      sent: false,
      reason,
      message: REFUSAL_MESSAGES[reason],
      destinationProjectId: input.destinationProjectId,
      path: "",
    },
  });
  if (typeof sourceFileId !== "string" || !job.projectId) {
    return refused("task_has_no_file");
  }
  // Checked before the projects, so a trigger on any project skips the tasks of projects that
  // do not translate into this language, the destination's own tasks among them.
  if (
    Array.isArray(targetLocales) &&
    destination?.sourceLocale &&
    !targetLocales.includes(destination.sourceLocale)
  ) {
    return refused("task_in_other_language");
  }
  return sendFileAsSource({ ...input, projectId: job.projectId, sourceFileId });
}

/** Sends the file of `sourceFileId`, a stored file of one of its uploads. */
async function sendFileAsSource(input: {
  organizationId: string;
  projectId: string;
  sourceFileId: string;
  destinationProjectId: string;
  /** The step's key, recorded on its send so a retry of the step finds it. */
  idempotencyKey?: string;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const projects = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        inArray(schema.projects.id, [input.projectId, input.destinationProjectId]),
      ),
    );
  const source = projects.find((project) => project.id === input.projectId);
  const destination = projects.find((project) => project.id === input.destinationProjectId);
  if (!source || !destination) {
    return failure("project_not_found", "Choose a project in this workspace.");
  }
  if (source.id === destination.id) {
    return failure("same_project", FAILURE_MESSAGES.same_project);
  }
  if (source.source !== "native" || destination.source !== "native") {
    return failure("project_not_native", FAILURE_MESSAGES.project_not_native);
  }
  if (!isTranslationSourceDestination(source, destination) || !destination.sourceLocale) {
    return failure(
      "destination_source_locale_mismatch",
      FAILURE_MESSAGES.destination_source_locale_mismatch,
    );
  }
  const locale = destination.sourceLocale;

  // Branch copies of a file share its stored files, so the default branch's file comes first.
  const [file] = await db
    .select({
      id: schema.repositorySourceFiles.id,
      sourcePath: schema.repositorySourceFiles.sourcePath,
      branchName: schema.repositorySourceFiles.branchName,
      projectId: schema.repositorySourceFiles.projectId,
    })
    .from(schema.repositorySourceFileVersions)
    .innerJoin(
      schema.repositorySourceFiles,
      eq(
        schema.repositorySourceFiles.id,
        schema.repositorySourceFileVersions.repositorySourceFileId,
      ),
    )
    .where(
      and(
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        eq(schema.repositorySourceFileVersions.projectId, source.id),
        eq(schema.repositorySourceFileVersions.storedFileId, input.sourceFileId),
      ),
    )
    .orderBy(sql`${schema.repositorySourceFiles.branchName} = ${DEFAULT_PROJECT_BRANCH_NAME} desc`)
    .limit(1);
  const destinationPath = file ? translationAsSourceDestinationPath(file.sourcePath) : "";
  const refused = (refusal: Refusal): VisualWorkflowNodeExecutionResult => ({
    ok: true,
    output: {
      sent: false,
      reason: refusal,
      message: REFUSAL_MESSAGES[refusal],
      destinationProjectId: destination.id,
      path: destinationPath,
    },
  });

  if (!file || file.projectId !== source.id) {
    return refused("source_file_not_found");
  }

  // A send reads the source project's default branch, so a file on another branch is not sent.
  if (file.branchName !== DEFAULT_PROJECT_BRANCH_NAME) {
    return refused("not_on_default_branch");
  }

  // Checked first: a file that came from that project is rightly never sent back, whatever is
  // at that path there.
  if (
    await isBuiltFromProject({
      organizationId: input.organizationId,
      repositorySourceFileId: file.id,
      projectId: destination.id,
    })
  ) {
    return refused("sent_from_destination");
  }

  const there = await getTranslationAsSourceDestinationFile({
    organizationId: input.organizationId,
    destinationProjectId: destination.id,
    destinationPath,
    repositorySourceFileId: file.id,
  });
  // A retry of this step after its upload went through: that upload is this step's send.
  if (
    there.state === "sent_from_here" &&
    input.idempotencyKey &&
    there.workflowStepKey === input.idempotencyKey
  ) {
    return {
      ok: true,
      output: {
        sent: true,
        destinationProjectId: destination.id,
        path: destinationPath,
        sourceFileVersionId: there.versionId,
      },
    };
  }
  const now = await db.execute<{ fingerprint: string | null }>(
    sql`select ${translationSourceFingerprintSql({
      organizationId: input.organizationId,
      projectId: source.id,
      repositorySourceFileId: file.id,
      locale,
    })} as fingerprint`,
  );
  const fingerprint = now.rows[0]?.fingerprint ?? null;
  if (there.state === "sent_from_here" && there.fingerprint && there.fingerprint === fingerprint) {
    return refused("already_sent");
  }

  const deferred: (() => Promise<unknown>)[] = [];
  let result;
  try {
    result = await sendTranslationAsSource({
      organizationId: input.organizationId,
      sourceProject: source,
      destinationProject: destination,
      sourcePath: file.sourcePath,
      locale,
      actorUserId: null,
      workflowStepKey: input.idempotencyKey,
      deferAfterResponse: (task) => deferred.push(task),
      fileStorageAdapter: input.fileStorageAdapter,
    });
  } finally {
    // Whatever was uploaded is read by the other project, even if the send then failed.
    await Promise.all(deferred.map((task) => task()));
  }

  if (isErr(result)) {
    return isRefusal(result.error.code)
      ? refused(result.error.code)
      : sendFailure(result.error, locale);
  }
  return {
    ok: true,
    output: {
      sent: true,
      destinationProjectId: destination.id,
      path: result.value.sourcePath,
      sourceFileVersionId: result.value.sourceFileVersionId,
      stringCount: result.value.stringCount,
    },
  };
}
