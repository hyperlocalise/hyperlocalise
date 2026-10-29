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
import { and, eq, inArray } from "drizzle-orm";

import type { Theme } from "loops";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import { getLatestRepositorySourceFileVersion } from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";
import { isErr } from "@/lib/primitives/result/results";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import { isLoopsLegacyContentError, type LoopsClient } from "./client";
import type { LoopsResourceKind } from "./constants";
import { loadLoopsAutomationClient } from "./credentials";
import {
  buildLoopsEmailSourcePath,
  hashLoopsContent,
  isLoopsLocaleCopyName,
} from "./html-envelope";
import {
  parseLoopsStyleTag,
  renderLoopsEmailDocument,
  resolveLoopsThemeStyles,
} from "./lmx-document";

const logger = createLogger("import-loops-emails");
const jobQueue = createTranslationJobEventQueue();

/**
 * Job statuses whose target locales already have translation coverage for a
 * given source file. Open jobs will produce translations; succeeded jobs
 * already did. Failed/cancelled jobs cover nothing, so a retry is still due.
 */
const LOOPS_IMPORT_COVERED_JOB_STATUSES = [
  "queued",
  "running",
  "waiting_for_review",
  "succeeded",
] as const;

type LoopsCoveredFileTranslationJob = {
  sourceFileId: string | null;
  targetLocales: readonly string[];
};

function readJobSourceFileId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const sourceFileId = (payload as { sourceFileId?: unknown }).sourceFileId;
  return typeof sourceFileId === "string" && sourceFileId.trim().length > 0 ? sourceFileId : null;
}

function readJobTargetLocales(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const targetLocales = (payload as { targetLocales?: unknown }).targetLocales;
  if (!Array.isArray(targetLocales)) {
    return [];
  }
  return targetLocales.filter(
    (locale): locale is string => typeof locale === "string" && locale.trim().length > 0,
  );
}

async function loadCoveredLoopsFileTranslationJobs(input: {
  organizationId: string;
  projectId: string;
}): Promise<LoopsCoveredFileTranslationJob[]> {
  const rows = await db
    .select({
      inputPayload: schema.jobs.inputPayload,
    })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.jobs.kind, "translation"),
        inArray(schema.jobs.status, [...LOOPS_IMPORT_COVERED_JOB_STATUSES]),
      ),
    );

  return rows.map((row) => ({
    sourceFileId: readJobSourceFileId(row.inputPayload),
    targetLocales: readJobTargetLocales(row.inputPayload),
  }));
}

/**
 * Load themes and components once per import run for File view styling.
 * Styling is best-effort: a failure still imports unstyled files.
 */
async function loadLoopsImportStyling(
  client: LoopsClient,
): Promise<{ themes: Theme[]; components: Map<string, string> }> {
  const themes: Theme[] = [];
  const components = new Map<string, string>();
  try {
    themes.push(...(await client.listThemes()));
  } catch (error) {
    logger.warn(
      { error: String(error) },
      "loops themes unavailable; importing without theme styles",
    );
  }
  try {
    for (const component of await client.listComponents()) {
      if (component.id && component.lmx) {
        components.set(component.id, component.lmx);
      }
    }
  } catch (error) {
    logger.warn(
      { error: String(error) },
      "loops components unavailable; importing without expansion",
    );
  }
  return { themes, components };
}

export type ImportLoopsEmailsResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
};

function resolveTargetLocales(input: {
  automation: WorkspaceAutomationRecord;
  projectTargetLocales: readonly string[];
  sourceLocale: string;
}): string[] {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  const configured =
    createJob?.useProjectTargetLocales === false && createJob?.targetLocales?.length
      ? createJob.targetLocales
      : [...input.projectTargetLocales];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const locale of configured) {
    const trimmed = locale.trim();
    if (!trimmed || trimmed.toLowerCase() === input.sourceLocale.toLowerCase()) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

async function upsertSourceFile(input: {
  organizationId: string;
  project: { id: string };
  sourcePath: string;
  html: string;
  hash: string;
  sourceLocale: string;
  workflowRunId?: string | null;
}): Promise<string | null> {
  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.project.id,
    sourcePath: input.sourcePath,
  });
  if (latest?.sourceHash === input.hash && latest.storedFileId) {
    // Content unchanged: reuse the stored file instead of creating a new
    // version, so scheduled re-imports stay idempotent.
    if (latest.ingestState === "ingested") {
      return latest.storedFileId;
    }
    if (latest.ingestState != null && latest.ingestState !== "failed") {
      const ingest = await waitForSourceFileVersionIngest({
        organizationId: input.organizationId,
        sourceFileVersionId: latest.id,
      });
      if (ingest === "ingested") {
        return latest.storedFileId;
      }
    }
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.project.id),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    return null;
  }

  const uploaded = await uploadSourceFile({
    organizationId: input.organizationId,
    project,
    sourcePath: input.sourcePath,
    sourceHash: input.hash,
    sourceLocale: input.sourceLocale,
    uploadSurface: "loops_automation",
    workflowRunId: input.workflowRunId,
    file: {
      filename: input.sourcePath.split("/").pop() ?? "email.html",
      contentType: "text/html",
      content: new TextEncoder().encode(input.html),
    },
  });
  if (!uploaded.ok || uploaded.value.destination !== "native") {
    return null;
  }
  const ingest = await waitForSourceFileVersionIngest({
    organizationId: input.organizationId,
    sourceFileVersionId: uploaded.value.file.sourceFileVersionId,
  });
  if (ingest !== "ingested") {
    return null;
  }
  return uploaded.value.file.id;
}

async function rememberSyncState(input: {
  organizationId: string;
  automationId: string;
  projectId: string;
  resourceKind: LoopsResourceKind;
  sourceId: string;
  sourceName: string;
  sourcePath: string;
  emailMessageId: string | null;
  parentId?: string | null;
  parentName?: string | null;
  sourceLocale: string;
  sourceUpdatedAt?: string | null;
  contentHash: string;
  sourceLmx: string;
  segmentCount: number;
  tokensBySegment: string[][];
}): Promise<void> {
  const parsedAt = input.sourceUpdatedAt ? new Date(input.sourceUpdatedAt) : null;
  await db
    .insert(schema.loopsEmailSyncStates)
    .values({
      organizationId: input.organizationId,
      automationId: input.automationId,
      projectId: input.projectId,
      resourceKind: input.resourceKind,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      sourcePath: input.sourcePath,
      emailMessageId: input.emailMessageId,
      parentId: input.parentId ?? null,
      parentName: input.parentName ?? null,
      sourceLocale: input.sourceLocale,
      sourceUpdatedAt: parsedAt && !Number.isNaN(parsedAt.getTime()) ? parsedAt : null,
      sourceContentHash: input.contentHash,
      sourceLmx: input.sourceLmx,
      segmentCount: String(input.segmentCount),
      variableTokens: input.tokensBySegment,
      lastImportedAt: new Date(),
      status: "active",
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [
        schema.loopsEmailSyncStates.organizationId,
        schema.loopsEmailSyncStates.automationId,
        schema.loopsEmailSyncStates.resourceKind,
        schema.loopsEmailSyncStates.sourceId,
      ],
      set: {
        sourceName: input.sourceName,
        sourcePath: input.sourcePath,
        emailMessageId: input.emailMessageId,
        parentId: input.parentId ?? null,
        parentName: input.parentName ?? null,
        sourceLocale: input.sourceLocale,
        sourceUpdatedAt: parsedAt && !Number.isNaN(parsedAt.getTime()) ? parsedAt : null,
        sourceContentHash: input.contentHash,
        sourceLmx: input.sourceLmx,
        segmentCount: String(input.segmentCount),
        variableTokens: input.tokensBySegment,
        lastImportedAt: new Date(),
        status: "active",
        lastError: null,
        updatedAt: new Date(),
      },
    });
}

async function importOneEmail(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  project: { id: string };
  client: LoopsClient;
  resourceKind: LoopsResourceKind;
  sourceId: string;
  sourceName: string;
  emailMessageId: string | null;
  parentId?: string | null;
  parentName?: string | null;
  updatedAt?: string | null;
  sourceLocale: string;
  targetLocales: string[];
  workflowRunId?: string | null;
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  themes: readonly Theme[];
  components: ReadonlyMap<string, string>;
}): Promise<{ status: "imported" | "skipped" | "failed"; jobId?: string }> {
  if (!input.emailMessageId) {
    return { status: "skipped" };
  }
  if (isLoopsLocaleCopyName(input.sourceName)) {
    return { status: "skipped" };
  }
  let message;
  try {
    message = await input.client.getEmailMessage(input.emailMessageId);
  } catch (error) {
    if (isLoopsLegacyContentError(error)) {
      logger.warn({ sourceId: input.sourceId }, "loops legacy MJML content skipped");
      return { status: "skipped" };
    }
    throw error;
  }

  const envelope = renderLoopsEmailDocument({
    subject: message.subject,
    previewText: message.previewText,
    lmx: message.lmx,
    styles: resolveLoopsThemeStyles({
      style: parseLoopsStyleTag(message.lmx),
      themes: input.themes,
    }),
    components: input.components,
  });
  const contentHash = hashLoopsContent(`${message.subject}\n${message.lmx}`);
  const sourcePath = buildLoopsEmailSourcePath({
    kind: input.resourceKind,
    id: input.sourceId,
    name: input.sourceName,
    parentSlug: input.parentName ?? undefined,
  });

  const sourceFileId = await upsertSourceFile({
    organizationId: input.organizationId,
    project: input.project,
    sourcePath,
    html: envelope.html,
    hash: contentHash,
    sourceLocale: input.sourceLocale,
    workflowRunId: input.workflowRunId,
  });
  if (!sourceFileId) {
    return { status: "failed" };
  }

  await rememberSyncState({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    projectId: input.projectId,
    resourceKind: input.resourceKind,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    sourcePath,
    emailMessageId: input.emailMessageId,
    parentId: input.parentId,
    parentName: input.parentName,
    sourceLocale: input.sourceLocale,
    sourceUpdatedAt: input.updatedAt,
    contentHash,
    sourceLmx: message.lmx,
    segmentCount: envelope.segments.length,
    tokensBySegment: envelope.tokensBySegment,
  });

  const createJob = input.automation.toolConfig.createNativeTmsJob;
  if (!createJob?.enabled || input.targetLocales.length === 0) {
    return { status: "imported" };
  }
  const uncovered = input.targetLocales.filter(
    (locale) =>
      !input.openJobs.some(
        (job) =>
          job.sourceFileId === sourceFileId &&
          job.targetLocales.some((entry) => entry.toLowerCase() === locale.toLowerCase()),
      ),
  );
  if (uncovered.length === 0) {
    return { status: "imported" };
  }
  const created = await createFileTranslationJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: uncovered,
    fileFormat: "html",
    metadata: { uploadSurface: "loops_automation" },
  });
  if (!created.ok) {
    return { status: "imported" };
  }
  if (input.automation.toolConfig.assignTranslateWithAgent?.enabled) {
    await enqueueExistingFileTranslationJob({
      organizationId: input.organizationId,
      jobId: created.jobId,
      jobQueue,
    });
  }
  input.openJobs.push({ sourceFileId, targetLocales: uncovered });
  return { status: "imported", jobId: created.jobId };
}

export async function runImportLoopsEmails(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<ImportLoopsEmailsResult> {
  const loops = input.automation.toolConfig.loops;
  if (!loops?.enabled || !loops.workosUserId) {
    throw new Error("loops_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("loops_project_required");
  }

  const loaded = await loadLoopsAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: loops.workosUserId,
    fetchImpl: input.fetchImpl,
  });
  if (isErr(loaded)) {
    throw new Error(loaded.error.code);
  }

  const [project] = await db
    .select({
      id: schema.projects.id,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new Error("loops_project_required");
  }

  const sourceLocale = loops.sourceLocale?.trim() || project.sourceLocale?.trim() || "en";
  const targetLocales = resolveTargetLocales({
    automation: input.automation,
    projectTargetLocales: project.targetLocales ?? [],
    sourceLocale,
  });

  // Preloaded with prior-run coverage (open + succeeded jobs) so scheduled
  // re-imports only queue translation work for locales lacking coverage.
  const openJobs = await loadCoveredLoopsFileTranslationJobs({
    organizationId: input.organizationId,
    projectId,
  });
  const { themes, components } = await loadLoopsImportStyling(loaded.value.client);
  const result: ImportLoopsEmailsResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    jobsCreated: 0,
    jobIds: [],
  };

  const selectedTransactional = new Set(loops.transactionalIds ?? []);
  const selectedCampaigns = new Set(loops.campaignIds ?? []);
  const selectedWorkflows = new Set(loops.workflowIds ?? []);

  const transactionals = await loaded.value.client.listTransactionalEmails();
  for (const item of transactionals) {
    if (selectedTransactional.size > 0 && !selectedTransactional.has(item.id)) {
      continue;
    }
    try {
      const outcome = await importOneEmail({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        project: { id: project.id },
        client: loaded.value.client,
        resourceKind: "transactional",
        sourceId: item.id,
        sourceName: item.name || item.id,
        emailMessageId: item.publishedEmailMessageId ?? item.draftEmailMessageId,
        updatedAt: item.updatedAt,
        sourceLocale,
        targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs,
        themes,
        components,
      });
      result[outcome.status === "imported" ? "imported" : outcome.status] += 1;
      if (outcome.jobId) {
        result.jobsCreated += 1;
        result.jobIds.push(outcome.jobId);
      }
    } catch (error) {
      logger.warn({ sourceId: item.id, error: String(error) }, "loops transactional import failed");
      result.failed += 1;
    }
  }

  const campaigns = await loaded.value.client.listCampaigns();
  for (const item of campaigns) {
    if (selectedCampaigns.size > 0 && !selectedCampaigns.has(item.id)) {
      continue;
    }
    try {
      const outcome = await importOneEmail({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        project: { id: project.id },
        client: loaded.value.client,
        resourceKind: "campaign",
        sourceId: item.id,
        sourceName: item.name || item.id,
        emailMessageId: item.emailMessageId,
        updatedAt: item.updatedAt,
        sourceLocale,
        targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs,
        themes,
        components,
      });
      result[outcome.status === "imported" ? "imported" : outcome.status] += 1;
      if (outcome.jobId) {
        result.jobsCreated += 1;
        result.jobIds.push(outcome.jobId);
      }
    } catch (error) {
      logger.warn({ sourceId: item.id, error: String(error) }, "loops campaign import failed");
      result.failed += 1;
    }
  }

  const workflows = await loaded.value.client.listWorkflows();
  for (const workflow of workflows) {
    if (selectedWorkflows.size > 0 && !selectedWorkflows.has(workflow.id)) {
      continue;
    }
    let nodes: Array<{ nodeId: string; emailMessageId: string }> = [];
    try {
      nodes = await loaded.value.client.listWorkflowEmailNodes(workflow.id);
    } catch (error) {
      logger.warn({ sourceId: workflow.id, error: String(error) }, "loops workflow nodes failed");
      result.failed += 1;
      continue;
    }
    for (const node of nodes) {
      try {
        const outcome = await importOneEmail({
          organizationId: input.organizationId,
          automation: input.automation,
          projectId,
          project: { id: project.id },
          client: loaded.value.client,
          resourceKind: "workflow",
          sourceId: `${workflow.id}:${node.nodeId}`,
          sourceName: `${workflow.name || workflow.id} / ${node.nodeId}`,
          emailMessageId: node.emailMessageId,
          parentId: workflow.id,
          parentName: workflow.name,
          updatedAt: workflow.updatedAt,
          sourceLocale,
          targetLocales,
          workflowRunId: input.workflowRunId,
          openJobs,
          themes,
          components,
        });
        result[outcome.status === "imported" ? "imported" : outcome.status] += 1;
        if (outcome.jobId) {
          result.jobsCreated += 1;
          result.jobIds.push(outcome.jobId);
        }
      } catch (error) {
        logger.warn(
          { sourceId: node.emailMessageId, error: String(error) },
          "loops workflow email import failed",
        );
        result.failed += 1;
      }
    }
  }

  return result;
}
