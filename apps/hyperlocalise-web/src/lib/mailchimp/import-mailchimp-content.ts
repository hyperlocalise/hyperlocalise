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

import type { MailchimpClient } from "./client";
import type { MailchimpResourceKind } from "./constants";
import { loadMailchimpAutomationClient } from "./credentials";
import {
  DEFAULT_MAILCHIMP_EXISTING_TRANSLATION_POLICY,
  isMailchimpExistingTranslationPolicy,
  type MailchimpExistingTranslationPolicy,
} from "./existing-translation-policy";
import {
  buildMailchimpSourcePath,
  hashMailchimpContent,
  serializeMailchimpEnvelope,
} from "./html-envelope";
import { isMailchimpLocaleCopyName, mailchimpCopyName } from "./locale";
import { seedMailchimpLocaleCopies } from "./seed-mailchimp-locale-copies";

const logger = createLogger("import-mailchimp-content");
const jobQueue = createTranslationJobEventQueue();

const COVERED_JOB_STATUSES = ["queued", "running", "waiting_for_review", "succeeded"] as const;

export type ImportMailchimpContentResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
  warnings: string[];
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

async function loadCoveredJobs(input: { organizationId: string; projectId: string }) {
  const rows = await db
    .select({ inputPayload: schema.jobs.inputPayload })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.jobs.kind, "translation"),
        inArray(schema.jobs.status, [...COVERED_JOB_STATUSES]),
      ),
    );
  return rows.map((row) => ({
    sourceFileId: readJobSourceFileId(row.inputPayload),
    targetLocales: readJobTargetLocales(row.inputPayload),
  }));
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
    uploadSurface: "mailchimp_automation",
    workflowRunId: input.workflowRunId,
    file: {
      filename: input.sourcePath.split("/").pop() ?? "content.html",
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
  resourceKind: MailchimpResourceKind;
  sourceId: string;
  sourceName: string;
  sourcePath: string;
  sourceLocale: string;
  contentHash: string;
  sourceHtml: string;
  htmlMergeTokens: string[];
  campaignRecreate: {
    listId: string;
    replyTo: string;
    fromEmail: string;
    fromName: string;
  } | null;
}): Promise<void> {
  await db
    .insert(schema.mailchimpContentSyncStates)
    .values({
      organizationId: input.organizationId,
      automationId: input.automationId,
      projectId: input.projectId,
      resourceKind: input.resourceKind,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      sourcePath: input.sourcePath,
      sourceLocale: input.sourceLocale,
      sourceContentHash: input.contentHash,
      sourceHtml: input.sourceHtml,
      htmlMergeTokens: input.htmlMergeTokens,
      campaignRecreate: input.campaignRecreate,
      lastImportedAt: new Date(),
      status: "active",
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [
        schema.mailchimpContentSyncStates.organizationId,
        schema.mailchimpContentSyncStates.automationId,
        schema.mailchimpContentSyncStates.resourceKind,
        schema.mailchimpContentSyncStates.sourceId,
      ],
      set: {
        sourceName: input.sourceName,
        sourcePath: input.sourcePath,
        sourceLocale: input.sourceLocale,
        sourceContentHash: input.contentHash,
        sourceHtml: input.sourceHtml,
        htmlMergeTokens: input.htmlMergeTokens,
        campaignRecreate: input.campaignRecreate,
        lastImportedAt: new Date(),
        status: "active",
        lastError: null,
        updatedAt: new Date(),
      },
    });
}

async function mergeMailchimpSyncLocaleCopyIds(input: {
  organizationId: string;
  automationId: string;
  resourceKind: MailchimpResourceKind;
  sourceId: string;
  localeCopyIds: Record<string, string>;
  sourceName: string;
}): Promise<void> {
  if (Object.keys(input.localeCopyIds).length === 0) {
    return;
  }
  const [row] = await db
    .select({
      id: schema.mailchimpContentSyncStates.id,
      localeCopyIds: schema.mailchimpContentSyncStates.localeCopyIds,
      localeCopyNames: schema.mailchimpContentSyncStates.localeCopyNames,
    })
    .from(schema.mailchimpContentSyncStates)
    .where(
      and(
        eq(schema.mailchimpContentSyncStates.organizationId, input.organizationId),
        eq(schema.mailchimpContentSyncStates.automationId, input.automationId),
        eq(schema.mailchimpContentSyncStates.resourceKind, input.resourceKind),
        eq(schema.mailchimpContentSyncStates.sourceId, input.sourceId),
      ),
    )
    .limit(1);
  if (!row) {
    return;
  }
  const localeCopyNames = { ...row.localeCopyNames };
  for (const locale of Object.keys(input.localeCopyIds)) {
    localeCopyNames[locale] = mailchimpCopyName(input.sourceName, locale);
  }
  await db
    .update(schema.mailchimpContentSyncStates)
    .set({
      localeCopyIds: { ...row.localeCopyIds, ...input.localeCopyIds },
      localeCopyNames,
      updatedAt: new Date(),
    })
    .where(eq(schema.mailchimpContentSyncStates.id, row.id));
}

async function maybeCreateJob(input: {
  automation: WorkspaceAutomationRecord;
  organizationId: string;
  projectId: string;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
}): Promise<string | undefined> {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  if (!createJob?.enabled || input.targetLocales.length === 0) {
    return undefined;
  }
  const uncovered = input.targetLocales.filter(
    (locale) =>
      !input.openJobs.some(
        (job) =>
          job.sourceFileId === input.sourceFileId &&
          job.targetLocales.some((entry) => entry.toLowerCase() === locale.toLowerCase()),
      ),
  );
  if (uncovered.length === 0) {
    return undefined;
  }
  const created = await createFileTranslationJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: uncovered,
    fileFormat: "html",
    metadata: { uploadSurface: "mailchimp_automation" },
  });
  if (!created.ok) {
    return undefined;
  }
  if (input.automation.toolConfig.assignTranslateWithAgent?.enabled) {
    await enqueueExistingFileTranslationJob({
      organizationId: input.organizationId,
      jobId: created.jobId,
      jobQueue,
    });
  }
  input.openJobs.push({ sourceFileId: input.sourceFileId, targetLocales: uncovered });
  return created.jobId;
}

async function importCampaign(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  project: { id: string };
  client: MailchimpClient;
  campaignId: string;
  sourceLocale: string;
  targetLocales: string[];
  workflowRunId?: string | null;
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  policy: MailchimpExistingTranslationPolicy;
  campaignByTitle: ReadonlyMap<string, string>;
  templateByName: ReadonlyMap<string, string>;
}): Promise<{ status: "imported" | "skipped" | "failed"; jobId?: string }> {
  const campaign = await input.client.getCampaign(input.campaignId);
  const title =
    campaign.settings.title?.trim() || campaign.settings.subject_line?.trim() || input.campaignId;
  if (isMailchimpLocaleCopyName(title)) {
    return { status: "skipped" };
  }
  const content = await input.client.getCampaignContent(input.campaignId);
  const html = content.html?.trim() ?? "";
  if (!html) {
    return { status: "skipped" };
  }
  const envelope = serializeMailchimpEnvelope({
    subject: campaign.settings.subject_line ?? "",
    previewText: campaign.settings.preview_text,
    fromName: campaign.settings.from_name,
    html,
  });
  const contentHash = hashMailchimpContent(envelope.html);
  const sourcePath = buildMailchimpSourcePath({
    kind: "campaign",
    id: input.campaignId,
    name: title,
  });
  const listId = campaign.recipients?.list_id?.trim() ?? "";
  const replyTo = campaign.settings.reply_to?.trim() ?? "";
  const fromName = campaign.settings.from_name?.trim() ?? "";
  const fromEmail = campaign.settings.from_email?.trim() || replyTo;
  if (!listId || !replyTo) {
    return { status: "skipped" };
  }

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
    resourceKind: "campaign",
    sourceId: input.campaignId,
    sourceName: title,
    sourcePath,
    sourceLocale: input.sourceLocale,
    contentHash,
    sourceHtml: html,
    htmlMergeTokens: envelope.htmlTokens,
    campaignRecreate: {
      listId,
      replyTo,
      fromEmail,
      fromName,
    },
  });

  const jobId = await maybeCreateJob({
    automation: input.automation,
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    openJobs: input.openJobs,
  });

  const seed = await seedMailchimpLocaleCopies({
    client: input.client,
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
    sourceName: title,
    resourceKind: "campaign",
    targetLocales: input.targetLocales,
    policy: input.policy,
    campaignByTitle: input.campaignByTitle,
    templateByName: input.templateByName,
  });
  await mergeMailchimpSyncLocaleCopyIds({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    resourceKind: "campaign",
    sourceId: input.campaignId,
    sourceName: title,
    localeCopyIds: seed.localeCopyIds,
  });

  return { status: "imported", jobId };
}

async function importTemplate(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  project: { id: string };
  client: MailchimpClient;
  templateId: string;
  sourceLocale: string;
  targetLocales: string[];
  workflowRunId?: string | null;
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  policy: MailchimpExistingTranslationPolicy;
  campaignByTitle: ReadonlyMap<string, string>;
  templateByName: ReadonlyMap<string, string>;
}): Promise<{ status: "imported" | "skipped" | "failed"; jobId?: string }> {
  const template = await input.client.getTemplate(input.templateId);
  const name = template.name?.trim() || input.templateId;
  if (isMailchimpLocaleCopyName(name)) {
    return { status: "skipped" };
  }
  const html = template.html?.trim() ?? "";
  if (!html) {
    return { status: "skipped" };
  }
  const envelope = serializeMailchimpEnvelope({
    subject: name,
    previewText: "",
    fromName: "",
    html,
  });
  const contentHash = hashMailchimpContent(envelope.html);
  const sourcePath = buildMailchimpSourcePath({
    kind: "template",
    id: input.templateId,
    name,
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
    resourceKind: "template",
    sourceId: input.templateId,
    sourceName: name,
    sourcePath,
    sourceLocale: input.sourceLocale,
    contentHash,
    sourceHtml: html,
    htmlMergeTokens: envelope.htmlTokens,
    campaignRecreate: null,
  });

  const jobId = await maybeCreateJob({
    automation: input.automation,
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    openJobs: input.openJobs,
  });

  const seed = await seedMailchimpLocaleCopies({
    client: input.client,
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
    sourceName: name,
    resourceKind: "template",
    targetLocales: input.targetLocales,
    policy: input.policy,
    campaignByTitle: input.campaignByTitle,
    templateByName: input.templateByName,
  });
  await mergeMailchimpSyncLocaleCopyIds({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    resourceKind: "template",
    sourceId: input.templateId,
    sourceName: name,
    localeCopyIds: seed.localeCopyIds,
  });

  return { status: "imported", jobId };
}

export async function runImportMailchimpContent(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<ImportMailchimpContentResult> {
  const mailchimp = input.automation.toolConfig.mailchimp;
  if (!mailchimp?.enabled || !mailchimp.workosUserId) {
    throw new Error("mailchimp_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("mailchimp_project_required");
  }

  const loaded = await loadMailchimpAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: mailchimp.workosUserId,
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
    throw new Error("mailchimp_project_required");
  }

  const sourceLocale = mailchimp.sourceLocale?.trim() || project.sourceLocale?.trim() || "en";
  const targetLocales = resolveTargetLocales({
    automation: input.automation,
    projectTargetLocales: project.targetLocales ?? [],
    sourceLocale,
  });
  const openJobs = await loadCoveredJobs({ organizationId: input.organizationId, projectId });

  const result: ImportMailchimpContentResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    jobsCreated: 0,
    jobIds: [],
    warnings: [],
  };

  const selectedCampaigns = new Set(mailchimp.campaignIds ?? []);
  const selectedTemplates = new Set(mailchimp.templateIds ?? []);
  const policy = isMailchimpExistingTranslationPolicy(mailchimp.existingTranslationPolicy)
    ? mailchimp.existingTranslationPolicy
    : DEFAULT_MAILCHIMP_EXISTING_TRANSLATION_POLICY;

  const campaigns = await loaded.value.client.listRegularCampaigns();
  const templates = await loaded.value.client.listUserTemplates();

  const campaignByTitle = new Map<string, string>();
  for (const item of campaigns) {
    const title = item.settings.title?.trim();
    if (title) {
      campaignByTitle.set(title, item.id);
    }
  }
  const templateByName = new Map<string, string>();
  for (const item of templates) {
    const name = item.name.trim();
    if (name) {
      templateByName.set(name, String(item.id));
    }
  }

  for (const item of campaigns) {
    if (selectedCampaigns.size > 0 && !selectedCampaigns.has(item.id)) {
      continue;
    }
    try {
      const outcome = await importCampaign({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        project: { id: project.id },
        client: loaded.value.client,
        campaignId: item.id,
        sourceLocale,
        targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs,
        policy,
        campaignByTitle,
        templateByName,
      });
      result[outcome.status] += 1;
      if (outcome.jobId) {
        result.jobsCreated += 1;
        result.jobIds.push(outcome.jobId);
      }
    } catch (error) {
      logger.warn({ sourceId: item.id, error: String(error) }, "mailchimp campaign import failed");
      result.failed += 1;
    }
  }

  for (const item of templates) {
    const id = String(item.id);
    if (selectedTemplates.size > 0 && !selectedTemplates.has(id)) {
      continue;
    }
    try {
      const outcome = await importTemplate({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        project: { id: project.id },
        client: loaded.value.client,
        templateId: id,
        sourceLocale,
        targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs,
        policy,
        campaignByTitle,
        templateByName,
      });
      result[outcome.status] += 1;
      if (outcome.jobId) {
        result.jobsCreated += 1;
        result.jobIds.push(outcome.jobId);
      }
    } catch (error) {
      logger.warn({ sourceId: id, error: String(error) }, "mailchimp template import failed");
      result.failed += 1;
    }
  }

  return result;
}
