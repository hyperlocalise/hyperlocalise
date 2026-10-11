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
import { and, eq } from "drizzle-orm";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import { getLatestRepositorySourceFileVersion } from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { importApprovedProjectTranslationsFromEntries } from "@/lib/projects/translations/project-translation-service";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import {
  BrazeApiError,
  isBrazeDragAndDropTemplateError,
  listAllBrazeContentBlocks,
  listAllBrazeEmailTemplates,
  type BrazeTemplatesClient,
} from "./client";
import { collectKnownBrazeCopyIds } from "./copy-filter";
import {
  mergeBrazeImportTargets,
  nextBrazeWatermark,
  shouldListBrazeWithoutWatermark,
} from "./import-selection";
import { loadBrazeAutomationClient } from "./credentials";
import {
  DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY,
  decideBrazeExistingTranslationAction,
  isBrazeExistingTranslationPolicy,
} from "./existing-translation-policy";
import {
  buildBrazeContentBlockSourcePath,
  buildBrazeEmailSourcePath,
  hashBrazeContent,
  serializeBrazeContentBlockEnvelope,
  serializeBrazeEmailEnvelope,
} from "./html-envelope";
import { mapProjectLocalesToBraze } from "./locale";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";

const logger = createLogger("import-braze-templates");
const jobQueue = createTranslationJobEventQueue();

export type ImportBrazeTemplatesResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
  translationsImported: number;
  translationsSkipped: number;
  translationsFailed: number;
};

function isoWatermark(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseRemoteDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function runImportBrazeTemplates(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string | null;
}): Promise<ImportBrazeTemplatesResult> {
  const braze = input.automation.toolConfig.braze;
  if (!braze?.enabled || !braze.workosUserId) {
    throw new Error("braze_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("braze_project_required");
  }

  const loaded = await loadBrazeAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: braze.workosUserId,
  });
  if (isErr(loaded)) {
    throw new Error(loaded.error.code);
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project || project.source !== "native") {
    throw new Error("braze_native_project_required");
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToBraze({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: braze.sourceLocale,
  });
  if (!localeMapping.sourceSuffix) {
    throw new Error("braze_source_locale_unmapped");
  }

  const existingMappings = await db
    .select()
    .from(schema.brazeTemplateSyncStates)
    .where(
      and(
        eq(schema.brazeTemplateSyncStates.organizationId, input.organizationId),
        eq(schema.brazeTemplateSyncStates.automationId, input.automation.id),
      ),
    );
  const knownCopyIds = collectKnownBrazeCopyIds(existingMappings);
  const [cursor] = await db
    .select()
    .from(schema.brazeSyncCursors)
    .where(eq(schema.brazeSyncCursors.automationId, input.automation.id))
    .limit(1);

  const client = loaded.value.client;
  const templateFilter = new Set(braze.templateIds ?? []);
  const blockFilter = new Set(braze.contentBlockIds ?? []);

  const listedTemplates = await listAllBrazeEmailTemplates(client, {
    modifiedAfter: shouldListBrazeWithoutWatermark(templateFilter)
      ? null
      : isoWatermark(cursor?.emailWatermarkUpdatedAt),
  });
  const listedBlocks = await listAllBrazeContentBlocks(client, {
    modifiedAfter: shouldListBrazeWithoutWatermark(blockFilter)
      ? null
      : isoWatermark(cursor?.contentBlockWatermarkUpdatedAt),
  });

  const templates = mergeBrazeImportTargets({
    listed: listedTemplates.map((item) => ({
      id: item.email_template_id,
      name: item.template_name,
      updatedAt: parseRemoteDate(item.updated_at),
    })),
    existing: existingMappings
      .filter((row) => row.resourceKind === "email_template")
      .map((row) => ({
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceUpdatedAt: row.sourceUpdatedAt,
      })),
    filterIds: templateFilter,
    knownCopyIds,
    suffixes: localeMapping.brazeSuffixes,
  });
  const blocks = mergeBrazeImportTargets({
    listed: listedBlocks.map((item) => ({
      id: item.content_block_id,
      name: item.name,
      updatedAt: parseRemoteDate(item.last_edited),
    })),
    existing: existingMappings
      .filter((row) => row.resourceKind === "content_block")
      .map((row) => ({
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceUpdatedAt: row.sourceUpdatedAt,
      })),
    filterIds: blockFilter,
    knownCopyIds,
    suffixes: localeMapping.brazeSuffixes,
  });

  const result: ImportBrazeTemplatesResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    jobsCreated: 0,
    jobIds: [],
    translationsImported: 0,
    translationsSkipped: 0,
    translationsFailed: 0,
  };

  const policy = isBrazeExistingTranslationPolicy(braze.existingTranslationPolicy)
    ? braze.existingTranslationPolicy
    : DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY;

  const emailSuccessUpdatedAt: Array<Date | null> = [];
  const emailFailedUpdatedAt: Array<Date | null> = [];
  const blockSuccessUpdatedAt: Array<Date | null> = [];
  const blockFailedUpdatedAt: Array<Date | null> = [];

  for (const template of templates) {
    const outcome = await importEmailTemplate({
      organizationId: input.organizationId,
      automation: input.automation,
      projectId,
      client,
      templateId: template.id,
      templateName: template.name,
      updatedAt: template.updatedAt,
      sourceLocale: localeMapping.sourceSuffix,
      localeMapping,
      policy,
      workflowRunId: input.workflowRunId,
      existing: existingMappings.find(
        (row) => row.resourceKind === "email_template" && row.sourceId === template.id,
      ),
    });
    applyOutcome(result, outcome);
    if (outcome.failed) {
      emailFailedUpdatedAt.push(template.updatedAt);
    } else if (outcome.imported) {
      emailSuccessUpdatedAt.push(template.updatedAt);
    }
  }

  for (const block of blocks) {
    const outcome = await importContentBlock({
      organizationId: input.organizationId,
      automation: input.automation,
      projectId,
      client,
      contentBlockId: block.id,
      name: block.name,
      updatedAt: block.updatedAt,
      sourceLocale: localeMapping.sourceSuffix,
      localeMapping,
      policy,
      workflowRunId: input.workflowRunId,
      existing: existingMappings.find(
        (row) => row.resourceKind === "content_block" && row.sourceId === block.id,
      ),
    });
    applyOutcome(result, outcome);
    if (outcome.failed) {
      blockFailedUpdatedAt.push(block.updatedAt);
    } else if (outcome.imported) {
      blockSuccessUpdatedAt.push(block.updatedAt);
    }
  }

  const emailWatermarkUpdatedAt = nextBrazeWatermark({
    previous: cursor?.emailWatermarkUpdatedAt,
    successUpdatedAt: emailSuccessUpdatedAt,
    failedUpdatedAt: emailFailedUpdatedAt,
  });
  const contentBlockWatermarkUpdatedAt = nextBrazeWatermark({
    previous: cursor?.contentBlockWatermarkUpdatedAt,
    successUpdatedAt: blockSuccessUpdatedAt,
    failedUpdatedAt: blockFailedUpdatedAt,
  });
  await db
    .insert(schema.brazeSyncCursors)
    .values({
      automationId: input.automation.id,
      organizationId: input.organizationId,
      emailWatermarkUpdatedAt,
      contentBlockWatermarkUpdatedAt,
    })
    .onConflictDoUpdate({
      target: schema.brazeSyncCursors.automationId,
      set: {
        emailWatermarkUpdatedAt,
        contentBlockWatermarkUpdatedAt,
        updatedAt: new Date(),
      },
    });

  return result;
}

function applyOutcome(
  result: ImportBrazeTemplatesResult,
  outcome: {
    imported: boolean;
    skipped: boolean;
    failed: boolean;
    jobId?: string;
    translationsImported: number;
    translationsSkipped: number;
    translationsFailed: number;
  },
) {
  if (outcome.imported) {
    result.imported += 1;
  }
  if (outcome.skipped) {
    result.skipped += 1;
  }
  if (outcome.failed) {
    result.failed += 1;
  }
  if (outcome.jobId) {
    result.jobsCreated += 1;
    result.jobIds.push(outcome.jobId);
  }
  result.translationsImported += outcome.translationsImported;
  result.translationsSkipped += outcome.translationsSkipped;
  result.translationsFailed += outcome.translationsFailed;
}

async function importEmailTemplate(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  client: BrazeTemplatesClient;
  templateId: string;
  templateName: string;
  updatedAt: Date | null;
  sourceLocale: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToBraze>;
  policy: ReturnType<typeof isBrazeExistingTranslationPolicy> extends never ? never : string;
  workflowRunId?: string | null;
  existing?: typeof schema.brazeTemplateSyncStates.$inferSelect;
}) {
  try {
    const info = await input.client.getEmailTemplate(input.templateId);
    const serialized = serializeBrazeEmailEnvelope({
      subject: info.subject ?? "",
      preheader: info.preheader,
      body: info.body ?? "",
      plaintext_body: info.plaintext_body,
    });
    const sourcePath =
      input.existing?.sourcePath ??
      buildBrazeEmailSourcePath({
        templateId: input.templateId,
        templateName: info.template_name || input.templateName,
      });
    const hash = hashBrazeContent(serialized.html);
    const sourceFileId = await upsertBrazeSourceFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
      html: serialized.html,
      hash,
      previousHash: input.existing?.sourceContentHash,
      workflowRunId: input.workflowRunId,
      sourceLocale: input.sourceLocale,
    });
    if (!sourceFileId) {
      throw new Error("braze_source_upload_failed");
    }

    const translationResult = await importLocaleCopies({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
      localeMapping: input.localeMapping,
      localeCopyIds: input.existing?.localeCopyIds ?? {},
      importedHashes: input.existing?.importedTranslationHashes ?? {},
      policy: isBrazeExistingTranslationPolicy(input.policy)
        ? input.policy
        : DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY,
      loadCopyHtml: async (copyId) => {
        const copy = await input.client.getEmailTemplate(copyId);
        return serializeBrazeEmailEnvelope({
          subject: copy.subject ?? "",
          preheader: copy.preheader,
          body: copy.body ?? "",
          plaintext_body: copy.plaintext_body,
        }).html;
      },
    });

    const jobId = await maybeCreateBrazeJob({
      organizationId: input.organizationId,
      automation: input.automation,
      projectId: input.projectId,
      sourceFileId,
      sourceLocale: input.sourceLocale,
      targetLocales: remainingJobLocales(input.localeMapping.jobTargetLocales, translationResult),
    });

    await upsertSyncState({
      organizationId: input.organizationId,
      automationId: input.automation.id,
      projectId: input.projectId,
      resourceKind: "email_template",
      sourceId: input.templateId,
      sourceName: info.template_name || input.templateName,
      sourcePath,
      sourceLocale: input.sourceLocale,
      sourceUpdatedAt: input.updatedAt,
      sourceContentHash: hash,
      liquidTokens: serialized.tokensByField,
      localeCopyIds: input.existing?.localeCopyIds ?? {},
      localeCopyNames: input.existing?.localeCopyNames ?? {},
      importedTranslationHashes: {
        ...input.existing?.importedTranslationHashes,
        ...translationResult.importedHashes,
      },
      extra: {
        shouldInlineCss: info.should_inline_css ?? null,
        description: info.description ?? null,
        tags: Array.isArray(info.tags) ? info.tags : [],
      },
      status: "active",
    });

    return {
      imported: true,
      skipped: false,
      failed: false,
      jobId,
      translationsImported: translationResult.imported,
      translationsSkipped: translationResult.skipped,
      translationsFailed: translationResult.failed,
    };
  } catch (error) {
    if (isBrazeDragAndDropTemplateError(error)) {
      logger.info({ templateId: input.templateId }, "skipped drag-and-drop email template");
      return emptySkipped();
    }
    logger.warn(
      {
        templateId: input.templateId,
        error: error instanceof Error ? error.message : String(error),
      },
      "braze email template import failed",
    );
    await upsertSyncState({
      organizationId: input.organizationId,
      automationId: input.automation.id,
      projectId: input.projectId,
      resourceKind: "email_template",
      sourceId: input.templateId,
      sourceName: input.templateName,
      sourcePath:
        input.existing?.sourcePath ??
        buildBrazeEmailSourcePath({
          templateId: input.templateId,
          templateName: input.templateName,
        }),
      sourceLocale: input.sourceLocale,
      sourceUpdatedAt: input.updatedAt,
      sourceContentHash: input.existing?.sourceContentHash ?? "",
      liquidTokens: input.existing?.liquidTokens ?? {},
      localeCopyIds: input.existing?.localeCopyIds ?? {},
      localeCopyNames: input.existing?.localeCopyNames ?? {},
      importedTranslationHashes: input.existing?.importedTranslationHashes ?? {},
      extra: input.existing?.extra ?? {},
      status: "import_failed",
      lastError: { message: error instanceof Error ? error.message : "import_failed" },
    });
    return emptyFailed();
  }
}

async function importContentBlock(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  client: BrazeTemplatesClient;
  contentBlockId: string;
  name: string;
  updatedAt: Date | null;
  sourceLocale: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToBraze>;
  policy: string;
  workflowRunId?: string | null;
  existing?: typeof schema.brazeTemplateSyncStates.$inferSelect;
}) {
  try {
    const info = await input.client.getContentBlock(input.contentBlockId);
    const serialized = serializeBrazeContentBlockEnvelope({ content: info.content ?? "" });
    const sourcePath =
      input.existing?.sourcePath ??
      buildBrazeContentBlockSourcePath({
        contentBlockId: input.contentBlockId,
        name: info.name || input.name,
      });
    const hash = hashBrazeContent(serialized.html);
    const sourceFileId = await upsertBrazeSourceFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
      html: serialized.html,
      hash,
      previousHash: input.existing?.sourceContentHash,
      workflowRunId: input.workflowRunId,
      sourceLocale: input.sourceLocale,
    });
    if (!sourceFileId) {
      throw new Error("braze_source_upload_failed");
    }

    const translationResult = await importLocaleCopies({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
      localeMapping: input.localeMapping,
      localeCopyIds: input.existing?.localeCopyIds ?? {},
      importedHashes: input.existing?.importedTranslationHashes ?? {},
      policy: isBrazeExistingTranslationPolicy(input.policy)
        ? input.policy
        : DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY,
      loadCopyHtml: async (copyId) => {
        const copy = await input.client.getContentBlock(copyId);
        return serializeBrazeContentBlockEnvelope({ content: copy.content ?? "" }).html;
      },
    });

    const jobId = await maybeCreateBrazeJob({
      organizationId: input.organizationId,
      automation: input.automation,
      projectId: input.projectId,
      sourceFileId,
      sourceLocale: input.sourceLocale,
      targetLocales: remainingJobLocales(input.localeMapping.jobTargetLocales, translationResult),
    });

    await upsertSyncState({
      organizationId: input.organizationId,
      automationId: input.automation.id,
      projectId: input.projectId,
      resourceKind: "content_block",
      sourceId: input.contentBlockId,
      sourceName: info.name || input.name,
      sourcePath,
      sourceLocale: input.sourceLocale,
      sourceUpdatedAt: input.updatedAt,
      sourceContentHash: hash,
      liquidTokens: serialized.tokensByField,
      localeCopyIds: input.existing?.localeCopyIds ?? {},
      localeCopyNames: input.existing?.localeCopyNames ?? {},
      importedTranslationHashes: {
        ...input.existing?.importedTranslationHashes,
        ...translationResult.importedHashes,
      },
      extra: {
        contentType: info.content_type ?? "html",
        description: info.description ?? null,
        tags: info.tags ?? [],
      },
      status: "active",
    });

    return {
      imported: true,
      skipped: false,
      failed: false,
      jobId,
      translationsImported: translationResult.imported,
      translationsSkipped: translationResult.skipped,
      translationsFailed: translationResult.failed,
    };
  } catch (error) {
    if (error instanceof BrazeApiError && error.code === "braze_drag_and_drop_template") {
      return emptySkipped();
    }
    logger.warn(
      {
        contentBlockId: input.contentBlockId,
        error: error instanceof Error ? error.message : String(error),
      },
      "braze content block import failed",
    );
    return emptyFailed();
  }
}

function emptySkipped() {
  return {
    imported: false,
    skipped: true,
    failed: false,
    translationsImported: 0,
    translationsSkipped: 0,
    translationsFailed: 0,
  };
}

function emptyFailed() {
  return {
    imported: false,
    skipped: false,
    failed: true,
    translationsImported: 0,
    translationsSkipped: 0,
    translationsFailed: 0,
  };
}

async function upsertBrazeSourceFile(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  html: string;
  hash: string;
  previousHash?: string;
  workflowRunId?: string | null;
  sourceLocale: string;
}): Promise<string | null> {
  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (
    input.previousHash === input.hash &&
    latest?.ingestState === "ingested" &&
    latest.storedFileId
  ) {
    return latest.storedFileId;
  }
  if (input.previousHash === input.hash && latest?.id) {
    const ingest = await waitForSourceFileVersionIngest({
      organizationId: input.organizationId,
      sourceFileVersionId: latest.id,
    });
    if (ingest === "ingested") {
      return latest.storedFileId;
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
    uploadSurface: "braze_automation",
    workflowRunId: input.workflowRunId,
    file: {
      filename: input.sourcePath.split("/").pop() ?? "template.html",
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

async function importLocaleCopies(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToBraze>;
  localeCopyIds: Record<string, string>;
  importedHashes: Record<string, string>;
  policy: "seed_empty" | "refresh_imported" | "overwrite_all";
  loadCopyHtml: (copyId: string) => Promise<string>;
}): Promise<{
  imported: number;
  skipped: number;
  failed: number;
  importedHashes: Record<string, string>;
}> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const importedHashes: Record<string, string> = {};

  for (let index = 0; index < input.localeMapping.jobTargetLocales.length; index += 1) {
    const projectLocale = input.localeMapping.jobTargetLocales[index];
    const suffix = input.localeMapping.brazeSuffixes[index];
    if (!projectLocale || !suffix) {
      continue;
    }
    const copyId = input.localeCopyIds[suffix];
    if (!copyId) {
      skipped += 1;
      continue;
    }
    try {
      const html = await input.loadCopyHtml(copyId);
      const incomingHash = hashBrazeContent(html);
      const action = decideBrazeExistingTranslationAction({
        policy: input.policy,
        incomingHash,
        presence: {
          hasExistingTranslation: Boolean(input.importedHashes[suffix] || incomingHash),
          importProvenanceOnly: Boolean(input.importedHashes[suffix]),
          contentHash: input.importedHashes[suffix] ?? null,
        },
      });
      if (action === "skip") {
        skipped += 1;
        continue;
      }
      await importApprovedProjectTranslationsFromEntries({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: projectLocale,
        entries: extractHtmlIngestEntries(html),
      });
      importedHashes[suffix] = incomingHash;
      imported += 1;
    } catch (error) {
      logger.warn(
        {
          copyId,
          error: error instanceof Error ? error.message : String(error),
        },
        "braze locale copy seed failed",
      );
      failed += 1;
    }
  }

  return { imported, skipped, failed, importedHashes };
}

function remainingJobLocales(
  jobTargetLocales: readonly string[],
  translationResult: { importedHashes: Record<string, string> },
): string[] {
  if (Object.keys(translationResult.importedHashes).length === 0) {
    return [...jobTargetLocales];
  }
  return [...jobTargetLocales];
}

async function maybeCreateBrazeJob(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
}): Promise<string | undefined> {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  if (!createJob?.enabled || input.targetLocales.length === 0) {
    return undefined;
  }
  const created = await createFileTranslationJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    fileFormat: "html",
    metadata: { uploadSurface: "braze_automation" },
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
  return created.jobId;
}

async function upsertSyncState(input: {
  organizationId: string;
  automationId: string;
  projectId: string;
  resourceKind: "email_template" | "content_block";
  sourceId: string;
  sourceName: string;
  sourcePath: string;
  sourceLocale: string;
  sourceUpdatedAt: Date | null;
  sourceContentHash: string;
  liquidTokens: Record<string, string[]>;
  localeCopyIds: Record<string, string>;
  localeCopyNames: Record<string, string>;
  importedTranslationHashes: Record<string, string>;
  extra: Record<string, unknown>;
  status: "active" | "import_failed" | "push_failed";
  lastError?: Record<string, unknown> | null;
}) {
  await db
    .insert(schema.brazeTemplateSyncStates)
    .values({
      organizationId: input.organizationId,
      automationId: input.automationId,
      projectId: input.projectId,
      resourceKind: input.resourceKind,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      sourcePath: input.sourcePath,
      sourceLocale: input.sourceLocale,
      sourceUpdatedAt: input.sourceUpdatedAt,
      sourceContentHash: input.sourceContentHash,
      liquidTokens: input.liquidTokens,
      localeCopyIds: input.localeCopyIds,
      localeCopyNames: input.localeCopyNames,
      importedTranslationHashes: input.importedTranslationHashes,
      extra: input.extra,
      status: input.status,
      lastError: input.lastError ?? null,
      lastImportedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.brazeTemplateSyncStates.organizationId,
        schema.brazeTemplateSyncStates.automationId,
        schema.brazeTemplateSyncStates.resourceKind,
        schema.brazeTemplateSyncStates.sourceId,
      ],
      set: {
        sourceName: input.sourceName,
        sourcePath: input.sourcePath,
        sourceLocale: input.sourceLocale,
        sourceUpdatedAt: input.sourceUpdatedAt,
        sourceContentHash: input.sourceContentHash,
        liquidTokens: input.liquidTokens,
        importedTranslationHashes: input.importedTranslationHashes,
        extra: input.extra,
        status: input.status,
        lastError: input.lastError ?? null,
        lastImportedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}
