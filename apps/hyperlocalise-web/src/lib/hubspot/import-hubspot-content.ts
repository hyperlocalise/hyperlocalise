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
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import type { HubspotContentClient } from "./client";
import type { HubspotResourceKind } from "./constants";
import { loadHubspotAutomationClient } from "./credentials";
import {
  buildBlogContentDocument,
  buildEmailDocument,
  buildFormDocument,
  buildPageDocument,
  hashHubspotContent,
  hubspotDocumentHasCopy,
  isHubspotJsonObject,
  serializeHubspotDocument,
  type HubspotJson,
} from "./document";
import {
  assignHubspotLocales,
  hubspotLanguageMatchesSource,
  isHubspotLocaleCopyName,
} from "./locale";
import { buildHubspotSourcePath } from "./source-path";

const logger = createLogger("import-hubspot-content");
const jobQueue = createTranslationJobEventQueue();

const COVERED_JOB_STATUSES = ["queued", "running", "waiting_for_review", "succeeded"] as const;

export type ImportHubspotContentResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
  warnings: string[];
};

type CoveredJob = {
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

function pushWarning(result: ImportHubspotContentResult, message: string) {
  if (result.warnings.length < 20 && !result.warnings.includes(message)) {
    result.warnings.push(message);
  }
}

async function loadCoveredJobs(input: {
  organizationId: string;
  projectId: string;
}): Promise<CoveredJob[]> {
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
  projectId: string;
  sourcePath: string;
  content: string;
  contentType: string;
  hash: string;
  sourceLocale: string;
  workflowRunId?: string | null;
}): Promise<string | null> {
  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
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
        eq(schema.projects.id, input.projectId),
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
    uploadSurface: "hubspot_automation",
    workflowRunId: input.workflowRunId,
    file: {
      filename: input.sourcePath.split("/").pop() ?? "content.json",
      contentType: input.contentType,
      content: new TextEncoder().encode(input.content),
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
  resourceKind: HubspotResourceKind;
  sourceId: string;
  sourceName: string;
  sourcePath: string;
  sourceLocale: string;
  contentHash: string;
}): Promise<void> {
  await db
    .insert(schema.hubspotContentSyncStates)
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
      lastImportedAt: new Date(),
      status: "active",
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [
        schema.hubspotContentSyncStates.organizationId,
        schema.hubspotContentSyncStates.automationId,
        schema.hubspotContentSyncStates.resourceKind,
        schema.hubspotContentSyncStates.sourceId,
      ],
      set: {
        sourceName: input.sourceName,
        sourcePath: input.sourcePath,
        sourceLocale: input.sourceLocale,
        sourceContentHash: input.contentHash,
        lastImportedAt: new Date(),
        status: "active",
        lastError: null,
        updatedAt: new Date(),
      },
    });
}

async function maybeCreateJob(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
  fileFormat: "json" | "html";
  openJobs: CoveredJob[];
}): Promise<string | null> {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  if (!createJob?.enabled || input.targetLocales.length === 0) {
    return null;
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
    return null;
  }
  const created = await createFileTranslationJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: uncovered,
    fileFormat: input.fileFormat,
    metadata: { uploadSurface: "hubspot_automation" },
  });
  if (!created.ok) {
    return null;
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

async function importOne(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  workflowRunId?: string | null;
  openJobs: CoveredJob[];
  result: ImportHubspotContentResult;
  kind: HubspotResourceKind;
  sourceId: string;
  sourceName: string;
  content: string;
  contentType: string;
  fileFormat: "json" | "html";
}): Promise<void> {
  const contentHash = hashHubspotContent(input.content);
  const sourcePath = buildHubspotSourcePath({
    kind: input.kind,
    id: input.sourceId,
    name: input.sourceName,
  });
  const sourceFileId = await upsertSourceFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
    content: input.content,
    contentType: input.contentType,
    hash: contentHash,
    sourceLocale: input.sourceLocale,
    workflowRunId: input.workflowRunId,
  });
  if (!sourceFileId) {
    input.result.failed += 1;
    return;
  }
  await rememberSyncState({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    projectId: input.projectId,
    resourceKind: input.kind,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    sourcePath,
    sourceLocale: input.sourceLocale,
    contentHash,
  });
  input.result.imported += 1;
  const jobId = await maybeCreateJob({
    organizationId: input.organizationId,
    automation: input.automation,
    projectId: input.projectId,
    sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    fileFormat: input.fileFormat,
    openJobs: input.openJobs,
  });
  if (jobId) {
    input.result.jobsCreated += 1;
    input.result.jobIds.push(jobId);
  }
}

function noteSkip(result: ImportHubspotContentResult, message: string) {
  result.skipped += 1;
  pushWarning(result, message);
}

function selectedIds(ids: readonly string[] | undefined): Set<string> | null {
  if (!ids || ids.length === 0) {
    return null;
  }
  return new Set(ids);
}

export async function runImportHubspotContent(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string | null;
  client?: HubspotContentClient;
}): Promise<ImportHubspotContentResult> {
  const hubspot = input.automation.toolConfig.hubspot;
  if (!hubspot?.enabled || !hubspot.workosUserId) {
    throw new Error("hubspot_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("hubspot_project_required");
  }

  let client = input.client;
  if (!client) {
    const loaded = await loadHubspotAutomationClient({
      localOrganizationId: input.organizationId,
      workosUserId: hubspot.workosUserId,
    });
    if (isErr(loaded)) {
      throw new Error(loaded.error.code);
    }
    client = loaded.value.client;
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
    throw new Error("hubspot_project_required");
  }

  const sourceLocale = hubspot.sourceLocale?.trim() || project.sourceLocale?.trim() || "en";
  const targetLocales = resolveTargetLocales({
    automation: input.automation,
    projectTargetLocales: project.targetLocales ?? [],
    sourceLocale,
  });
  const openJobs = await loadCoveredJobs({
    organizationId: input.organizationId,
    projectId,
  });
  const result: ImportHubspotContentResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    jobsCreated: 0,
    jobIds: [],
    warnings: [],
  };

  for (const surface of ["email", "form", "blog", "landing-page", "website-page"] as const) {
    const assignment = assignHubspotLocales(targetLocales, surface);
    for (const locale of assignment.unmapped) {
      pushWarning(result, `${surface}: ${locale} has no HubSpot language code`);
    }
    for (const collision of assignment.collisions) {
      pushWarning(
        result,
        `${surface}: ${collision.locale} uses the same HubSpot code as ${collision.keptLocale} (${collision.code})`,
      );
    }
  }

  const emailIds = selectedIds(hubspot.emailIds);
  const formIds = selectedIds(hubspot.formIds);
  const blogIds = selectedIds(hubspot.blogPostIds);
  const landingPageIds = selectedIds(hubspot.landingPageIds);
  const websitePageIds = selectedIds(hubspot.websitePageIds);

  const emails = await client.listEmails();
  for (const summary of emails) {
    if (emailIds && !emailIds.has(summary.id)) {
      continue;
    }
    if (isHubspotLocaleCopyName(summary.name)) {
      noteSkip(result, `Email "${summary.name}" looks like a locale copy`);
      continue;
    }
    if (
      !hubspotLanguageMatchesSource({
        objectLanguage: summary.language,
        projectSourceLocale: sourceLocale,
        surface: "email",
      })
    ) {
      noteSkip(
        result,
        `Email "${summary.name}" is ${summary.language}, which does not match the project source ${sourceLocale}`,
      );
      continue;
    }
    try {
      const email = await client.getEmail(summary.id);
      const document = buildEmailDocument({ subject: email.subject, widgets: email.widgets });
      if (!hubspotDocumentHasCopy(document)) {
        noteSkip(result, `Email "${summary.name}" has no translatable text`);
        continue;
      }
      await importOne({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        sourceLocale,
        targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs,
        result,
        kind: "email",
        sourceId: email.id,
        sourceName: email.name || summary.name,
        content: serializeHubspotDocument(document),
        contentType: "application/json",
        fileFormat: "json",
      });
    } catch (error) {
      logger.warn({ sourceId: summary.id, error: String(error) }, "hubspot email import failed");
      result.failed += 1;
    }
  }

  const forms = await client.listForms();
  for (const summary of forms) {
    if (formIds && !formIds.has(summary.id)) {
      continue;
    }
    if (isHubspotLocaleCopyName(summary.name)) {
      noteSkip(result, `Form "${summary.name}" looks like a locale copy`);
      continue;
    }
    if (
      !hubspotLanguageMatchesSource({
        objectLanguage: summary.language,
        projectSourceLocale: sourceLocale,
        surface: "form",
      })
    ) {
      noteSkip(
        result,
        `Form "${summary.name}" is ${summary.language}, which does not match the project source ${sourceLocale}`,
      );
      continue;
    }
    try {
      const form = await client.getForm(summary.id);
      const document = buildFormDocument(form.definition);
      if (!hubspotDocumentHasCopy(document)) {
        noteSkip(result, `Form "${summary.name}" has no translatable text`);
        continue;
      }
      await importOne({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        sourceLocale,
        targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs,
        result,
        kind: "form",
        sourceId: form.id,
        sourceName: form.name || summary.name,
        content: serializeHubspotDocument(document),
        contentType: "application/json",
        fileFormat: "json",
      });
    } catch (error) {
      logger.warn({ sourceId: summary.id, error: String(error) }, "hubspot form import failed");
      result.failed += 1;
    }
  }

  const posts = await client.listBlogPosts();
  for (const summary of posts) {
    if (blogIds && !blogIds.has(summary.id)) {
      continue;
    }
    if (summary.translatedFromId) {
      noteSkip(result, `Blog post "${summary.name}" is already a language variation`);
      continue;
    }
    if (isHubspotLocaleCopyName(summary.name)) {
      noteSkip(result, `Blog post "${summary.name}" looks like a locale copy`);
      continue;
    }
    if (
      !hubspotLanguageMatchesSource({
        objectLanguage: summary.language,
        projectSourceLocale: sourceLocale,
        surface: "blog",
      })
    ) {
      noteSkip(
        result,
        `Blog post "${summary.name}" is ${summary.language}, which does not match the project source ${sourceLocale}`,
      );
      continue;
    }
    try {
      const post = await client.getBlogPost(summary.id);
      const document = buildBlogContentDocument(post);
      if (!hubspotDocumentHasCopy(document)) {
        noteSkip(result, `Blog post "${summary.name}" has no translatable text`);
        continue;
      }
      await importOne({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        sourceLocale,
        targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs,
        result,
        kind: "blog",
        sourceId: post.id,
        sourceName: post.name || summary.name,
        content: serializeHubspotDocument(document),
        contentType: "application/json",
        fileFormat: "json",
      });
    } catch (error) {
      logger.warn({ sourceId: summary.id, error: String(error) }, "hubspot blog import failed");
      result.failed += 1;
    }
  }

  await importCmsPages({
    kind: "landing-page",
    ids: landingPageIds,
    list: () => client.listLandingPages(),
    get: (id) => client.getLandingPage(id),
    organizationId: input.organizationId,
    automation: input.automation,
    projectId,
    sourceLocale,
    targetLocales,
    workflowRunId: input.workflowRunId,
    openJobs,
    result,
  });
  await importCmsPages({
    kind: "website-page",
    ids: websitePageIds,
    list: () => client.listWebsitePages(),
    get: (id) => client.getWebsitePage(id),
    organizationId: input.organizationId,
    automation: input.automation,
    projectId,
    sourceLocale,
    targetLocales,
    workflowRunId: input.workflowRunId,
    openJobs,
    result,
  });

  return result;
}

async function importCmsPages(input: {
  kind: "landing-page" | "website-page";
  ids: Set<string> | null;
  list: () => Promise<Awaited<ReturnType<HubspotContentClient["listLandingPages"]>>>;
  get: (id: string) => Promise<Awaited<ReturnType<HubspotContentClient["getLandingPage"]>>>;
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  workflowRunId?: string | null;
  openJobs: CoveredJob[];
  result: ImportHubspotContentResult;
}) {
  const summaries = await input.list();
  for (const summary of summaries) {
    if (input.ids && !input.ids.has(summary.id)) {
      continue;
    }
    const pageLabel = input.kind === "landing-page" ? "Landing page" : "Website page";
    if (summary.translatedFromId) {
      noteSkip(input.result, `${pageLabel} "${summary.name}" is already a language variation`);
      continue;
    }
    if (isHubspotLocaleCopyName(summary.name)) {
      noteSkip(input.result, `${pageLabel} "${summary.name}" looks like a locale copy`);
      continue;
    }
    if (
      !hubspotLanguageMatchesSource({
        objectLanguage: summary.language,
        projectSourceLocale: input.sourceLocale,
        surface: input.kind,
      })
    ) {
      noteSkip(
        input.result,
        `${pageLabel} "${summary.name}" is ${summary.language}, which does not match the project source ${input.sourceLocale}`,
      );
      continue;
    }
    try {
      const page = await input.get(summary.id);
      const document = buildPageDocument(page);
      if (!hubspotDocumentHasCopy(document)) {
        noteSkip(
          input.result,
          `${pageLabel} "${summary.name}" has no module text on the published page, its draft, or its template.`,
        );
        continue;
      }
      await importOne({
        organizationId: input.organizationId,
        automation: input.automation,
        projectId: input.projectId,
        sourceLocale: input.sourceLocale,
        targetLocales: input.targetLocales,
        workflowRunId: input.workflowRunId,
        openJobs: input.openJobs,
        result: input.result,
        kind: input.kind,
        sourceId: page.id,
        sourceName: page.name || summary.name,
        content: serializeHubspotDocument(document),
        contentType: "application/json",
        fileFormat: "json",
      });
    } catch (error) {
      logger.warn(
        { sourceId: summary.id, kind: input.kind, error: String(error) },
        "hubspot page import failed",
      );
      input.result.failed += 1;
    }
  }
}

export function readHubspotDocumentJson(content: string): { [key: string]: HubspotJson } | null {
  const parsed = safeJsonParse(content);
  if (!parsed.ok) {
    return null;
  }
  const value: HubspotJson = parsed.value;
  if (!isHubspotJsonObject(value)) {
    return null;
  }
  return value;
}
