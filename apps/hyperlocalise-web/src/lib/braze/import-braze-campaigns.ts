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
import {
  INTERCOM_IMPORT_OPEN_JOB_STATUSES,
  readFileTranslationJobSourceFileId,
  readFileTranslationJobTargetLocales,
} from "@/lib/intercom/import-intercom-jobs";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import {
  importApprovedProjectTranslationsFromEntries,
  ProjectTranslationService,
} from "@/lib/projects/translations/project-translation-service";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import {
  leftoverBrazeJobLocalesNotCoveredByOpenJobs,
  intersectBrazeJobLocales,
} from "./discover-locale-copies";
import {
  BrazeApiError,
  brazePermissionNameFromError,
  listAllBrazeCampaigns,
  listAllBrazeCanvases,
  type BrazeLocaleTranslation,
  type BrazeTemplatesClient,
} from "./client";
import { loadBrazeAutomationClient } from "./credentials";
import {
  decideBrazeExistingTranslationAction,
  DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY,
  isBrazeExistingTranslationPolicy,
  brazeTranslationPresence,
} from "./existing-translation-policy";
import {
  mapProjectLocalesToBraze,
  mapProjectLocalesToBrazeLocaleIds,
  type BrazeLocaleIdentity,
} from "./locale";
import {
  buildBrazeCampaignSourcePath,
  buildBrazeCanvasSourcePath,
  hashBrazeTranslationMap,
  readBrazeTranslationMap,
  serializeBrazeTranslationMap,
  type BrazeTranslationMap,
} from "./translation-map";

const logger = createLogger("import-braze-campaigns");
const jobQueue = createTranslationJobEventQueue();
export const BRAZE_CAMPAIGN_IMPORT_CONCURRENCY = 3;

export function selectedBrazeResourceIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

export function shouldListAllBrazeResources(ids: readonly string[]): boolean {
  return selectedBrazeResourceIds(ids).length === 0;
}

export function isBrazeListItemArchived(item: {
  archived?: boolean;
  is_archived?: boolean;
}): boolean {
  return item.archived === true || item.is_archived === true;
}

export function shouldImportBrazeDraftVariation(input: {
  isDraft: boolean;
  postLaunchDraft: boolean;
  sourceMap: BrazeTranslationMap;
}): boolean {
  if (Object.keys(input.sourceMap).length === 0) {
    return false;
  }
  return input.isDraft || input.postLaunchDraft;
}

export type ImportBrazeCampaignsResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
};

function permissionErrorMessage(error: unknown): string {
  const permission = brazePermissionNameFromError(error);
  if (permission) {
    return `This API key is missing Braze permission ${permission}.`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isNoMultiLanguage(error: unknown): boolean {
  return error instanceof BrazeApiError && error.code === "braze_no_multi_language";
}

async function loadSourceTranslations(
  load: (postLaunchDraftVersion: boolean) => Promise<BrazeLocaleTranslation[]>,
): Promise<{ translations: BrazeLocaleTranslation[]; postLaunchDraft: boolean } | null> {
  try {
    const draft = await load(true);
    if (draft.some((entry) => Object.keys(entry.translation_map).length > 0)) {
      return { translations: draft, postLaunchDraft: true };
    }
  } catch (error) {
    if (!isNoMultiLanguage(error) && !(error instanceof BrazeApiError && error.status === 404)) {
      throw error;
    }
  }
  try {
    const live = await load(false);
    if (live.some((entry) => Object.keys(entry.translation_map).length > 0)) {
      return { translations: live, postLaunchDraft: false };
    }
  } catch (error) {
    if (isNoMultiLanguage(error) || (error instanceof BrazeApiError && error.status === 404)) {
      return null;
    }
    throw error;
  }
  return null;
}

function sourceMapFromTranslations(translations: BrazeLocaleTranslation[]): BrazeTranslationMap {
  const first = translations.find((entry) => Object.keys(entry.translation_map).length > 0);
  return readBrazeTranslationMap(first?.translation_map);
}

function localesFromTranslations(translations: BrazeLocaleTranslation[]): BrazeLocaleIdentity[] {
  return translations
    .map((entry) => entry.locale)
    .filter((locale) => locale.uuid.trim().length > 0);
}

export async function runImportBrazeCampaigns(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string;
}): Promise<ImportBrazeCampaignsResult> {
  const config = input.automation.toolConfig.brazeCampaigns;
  if (!config?.enabled) {
    return { imported: 0, skipped: 0, failed: 0, jobsCreated: 0 };
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return { imported: 0, skipped: 0, failed: 0, jobsCreated: 0 };
  }

  const loaded = await loadBrazeAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: config.workosUserId,
  });
  if (isErr(loaded)) {
    throw new Error(loaded.error.message);
  }

  const [project] = await db
    .select({
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
    return { imported: 0, skipped: 0, failed: 0, jobsCreated: 0 };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToBraze({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: config.sourceLocale,
  });
  const sourceLocale = localeMapping.sourceSuffix;
  if (!sourceLocale) {
    return { imported: 0, skipped: 0, failed: 0, jobsCreated: 0 };
  }

  const policy = isBrazeExistingTranslationPolicy(config.existingTranslationPolicy)
    ? config.existingTranslationPolicy
    : DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY;
  const campaignIds = selectedBrazeResourceIds(config.campaignIds);
  const canvasIds = selectedBrazeResourceIds(config.canvasIds);
  const existing = await db
    .select()
    .from(schema.brazeCampaignSyncStates)
    .where(
      and(
        eq(schema.brazeCampaignSyncStates.organizationId, input.organizationId),
        eq(schema.brazeCampaignSyncStates.automationId, input.automation.id),
      ),
    );
  const existingBySourceId = new Map(existing.map((row) => [row.sourceId, row]));
  const openJobs = await loadOpenBrazeFileTranslationJobs({
    organizationId: input.organizationId,
    projectId,
  });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let jobsCreated = 0;

  const campaignResults = await mapWithConcurrency(
    await resolveBrazeCampaignImportTargets(loaded.value.client, campaignIds),
    BRAZE_CAMPAIGN_IMPORT_CONCURRENCY,
    async (target) => {
      if (!target) {
        return { imported: 0, skipped: 0, failed: 1, jobsCreated: 0 };
      }
      try {
        if (target.details.isArchived) {
          return { imported: 0, skipped: 1, failed: 0, jobsCreated: 0 };
        }
        const totals: ImportBrazeCampaignsResult = {
          imported: 0,
          skipped: 0,
          failed: 0,
          jobsCreated: 0,
        };
        for (const variation of target.details.variations) {
          const result = await importCampaignVariation({
            organizationId: input.organizationId,
            automation: input.automation,
            projectId,
            workflowRunId: input.workflowRunId,
            client: loaded.value.client,
            localeMapping,
            policy,
            openJobs,
            existing: existingBySourceId,
            campaignId: target.details.id,
            campaignName: target.details.name,
            isDraft: target.details.isDraft || target.listedAsDraft,
            lastEdited: target.details.lastEdited ?? target.listedLastEdited,
            messageVariationId: variation.messageVariationId,
            variationName: variation.name,
            sourceLocale,
          });
          totals.imported += result.imported;
          totals.skipped += result.skipped;
          totals.failed += result.failed;
          totals.jobsCreated += result.jobsCreated;
        }
        return totals;
      } catch (error) {
        logger.warn({ error: permissionErrorMessage(error) }, "braze campaign import failed");
        return { imported: 0, skipped: 0, failed: 1, jobsCreated: 0 };
      }
    },
  );

  const canvasResults = await mapWithConcurrency(
    await resolveBrazeCanvasImportTargets(loaded.value.client, canvasIds),
    BRAZE_CAMPAIGN_IMPORT_CONCURRENCY,
    async (target) => {
      if (!target) {
        return { imported: 0, skipped: 0, failed: 1, jobsCreated: 0 };
      }
      try {
        if (target.details.isArchived) {
          return { imported: 0, skipped: 1, failed: 0, jobsCreated: 0 };
        }
        const totals: ImportBrazeCampaignsResult = {
          imported: 0,
          skipped: 0,
          failed: 0,
          jobsCreated: 0,
        };
        for (const step of target.details.steps) {
          for (const variation of step.variations) {
            const result = await importCanvasVariation({
              organizationId: input.organizationId,
              automation: input.automation,
              projectId,
              workflowRunId: input.workflowRunId,
              client: loaded.value.client,
              localeMapping,
              policy,
              openJobs,
              existing: existingBySourceId,
              workflowId: target.details.id,
              canvasName: target.details.name,
              stepId: step.stepId,
              stepName: step.name,
              isDraft: target.details.isDraft || target.listedAsDraft,
              lastEdited: target.details.lastEdited ?? target.listedLastEdited,
              messageVariationId: variation.messageVariationId,
              variationName: variation.name,
              sourceLocale,
            });
            totals.imported += result.imported;
            totals.skipped += result.skipped;
            totals.failed += result.failed;
            totals.jobsCreated += result.jobsCreated;
          }
        }
        return totals;
      } catch (error) {
        logger.warn({ error: permissionErrorMessage(error) }, "braze canvas import failed");
        return { imported: 0, skipped: 0, failed: 1, jobsCreated: 0 };
      }
    },
  );

  for (const result of [...campaignResults, ...canvasResults]) {
    imported += result.imported;
    skipped += result.skipped;
    failed += result.failed;
    jobsCreated += result.jobsCreated;
  }

  return { imported, skipped, failed, jobsCreated };
}

async function loadCampaignImportTarget(
  client: BrazeTemplatesClient,
  id: string,
  listed?: { draft?: boolean; is_draft?: boolean; last_edited?: string },
): Promise<{
  details: Awaited<ReturnType<BrazeTemplatesClient["getCampaignDetails"]>>;
  listedAsDraft: boolean;
  listedLastEdited?: string;
} | null> {
  try {
    return {
      details: await client.getCampaignDetails(id),
      listedAsDraft: listed?.draft === true || listed?.is_draft === true,
      listedLastEdited: listed?.last_edited,
    };
  } catch (error) {
    logger.warn({ error: permissionErrorMessage(error) }, "braze campaign import failed");
    return null;
  }
}

async function loadCanvasImportTarget(
  client: BrazeTemplatesClient,
  id: string,
  listed?: { draft?: boolean; is_draft?: boolean; last_edited?: string },
): Promise<{
  details: Awaited<ReturnType<BrazeTemplatesClient["getCanvasDetails"]>>;
  listedAsDraft: boolean;
  listedLastEdited?: string;
} | null> {
  try {
    return {
      details: await client.getCanvasDetails(id),
      listedAsDraft: listed?.draft === true || listed?.is_draft === true,
      listedLastEdited: listed?.last_edited,
    };
  } catch (error) {
    logger.warn({ error: permissionErrorMessage(error) }, "braze canvas import failed");
    return null;
  }
}

async function resolveBrazeCampaignImportTargets(
  client: BrazeTemplatesClient,
  campaignIds: readonly string[],
) {
  if (!shouldListAllBrazeResources(campaignIds)) {
    return mapWithConcurrency(
      selectedBrazeResourceIds(campaignIds),
      BRAZE_CAMPAIGN_IMPORT_CONCURRENCY,
      (id) => loadCampaignImportTarget(client, id),
    );
  }

  const listed = (await listAllBrazeCampaigns(client)).filter(
    (campaign) => !isBrazeListItemArchived(campaign),
  );
  return mapWithConcurrency(listed, BRAZE_CAMPAIGN_IMPORT_CONCURRENCY, (campaign) =>
    loadCampaignImportTarget(client, campaign.id, campaign),
  );
}

async function resolveBrazeCanvasImportTargets(
  client: BrazeTemplatesClient,
  canvasIds: readonly string[],
) {
  if (!shouldListAllBrazeResources(canvasIds)) {
    return mapWithConcurrency(
      selectedBrazeResourceIds(canvasIds),
      BRAZE_CAMPAIGN_IMPORT_CONCURRENCY,
      (id) => loadCanvasImportTarget(client, id),
    );
  }

  const listed = (await listAllBrazeCanvases(client)).filter(
    (canvas) => !isBrazeListItemArchived(canvas),
  );
  return mapWithConcurrency(listed, BRAZE_CAMPAIGN_IMPORT_CONCURRENCY, (canvas) =>
    loadCanvasImportTarget(client, canvas.id, canvas),
  );
}

async function importCampaignVariation(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  workflowRunId?: string;
  client: BrazeTemplatesClient;
  localeMapping: ReturnType<typeof mapProjectLocalesToBraze>;
  policy: "seed_empty" | "refresh_imported" | "overwrite_all";
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  existing: Map<string, typeof schema.brazeCampaignSyncStates.$inferSelect>;
  campaignId: string;
  campaignName: string;
  isDraft: boolean;
  lastEdited?: string;
  messageVariationId: string;
  variationName?: string;
  sourceLocale: string;
}): Promise<ImportBrazeCampaignsResult> {
  const sourceId = `${input.campaignId}:${input.messageVariationId}`;
  const loaded = await loadSourceTranslations((postLaunchDraftVersion) =>
    input.client.getCampaignSourceTranslations({
      campaignId: input.campaignId,
      messageVariationId: input.messageVariationId,
      postLaunchDraftVersion,
    }),
  );
  if (!loaded) {
    return { imported: 0, skipped: 1, failed: 0, jobsCreated: 0 };
  }
  const sourceMap = sourceMapFromTranslations(loaded.translations);
  if (
    !shouldImportBrazeDraftVariation({
      isDraft: input.isDraft,
      postLaunchDraft: loaded.postLaunchDraft,
      sourceMap,
    })
  ) {
    return { imported: 0, skipped: 1, failed: 0, jobsCreated: 0 };
  }

  let localeTranslations: BrazeLocaleTranslation[] = [];
  try {
    localeTranslations = await input.client.getCampaignTranslations({
      campaignId: input.campaignId,
      messageVariationId: input.messageVariationId,
      postLaunchDraftVersion: loaded.postLaunchDraft,
    });
  } catch (error) {
    if (!isNoMultiLanguage(error)) {
      throw error;
    }
  }

  return upsertImportedVariation({
    ...input,
    sourceId,
    resourceKind: "campaign",
    sourcePath: buildBrazeCampaignSourcePath({
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      messageVariationId: input.messageVariationId,
      variationName: input.variationName,
    }),
    sourceName: input.variationName
      ? `${input.campaignName} / ${input.variationName}`
      : input.campaignName,
    sourceMap,
    localeTranslations,
    campaignId: input.campaignId,
    workflowId: null,
    stepId: null,
  });
}

async function importCanvasVariation(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  workflowRunId?: string;
  client: BrazeTemplatesClient;
  localeMapping: ReturnType<typeof mapProjectLocalesToBraze>;
  policy: "seed_empty" | "refresh_imported" | "overwrite_all";
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  existing: Map<string, typeof schema.brazeCampaignSyncStates.$inferSelect>;
  workflowId: string;
  canvasName: string;
  stepId: string;
  stepName?: string;
  isDraft: boolean;
  lastEdited?: string;
  messageVariationId: string;
  variationName?: string;
  sourceLocale: string;
}): Promise<ImportBrazeCampaignsResult> {
  const sourceId = `${input.workflowId}:${input.stepId}:${input.messageVariationId}`;
  const loaded = await loadSourceTranslations((postLaunchDraftVersion) =>
    input.client.getCanvasSourceTranslations({
      workflowId: input.workflowId,
      stepId: input.stepId,
      messageVariationId: input.messageVariationId,
      postLaunchDraftVersion,
    }),
  );
  if (!loaded) {
    return { imported: 0, skipped: 1, failed: 0, jobsCreated: 0 };
  }
  const sourceMap = sourceMapFromTranslations(loaded.translations);
  if (
    !shouldImportBrazeDraftVariation({
      isDraft: input.isDraft,
      postLaunchDraft: loaded.postLaunchDraft,
      sourceMap,
    })
  ) {
    return { imported: 0, skipped: 1, failed: 0, jobsCreated: 0 };
  }

  let localeTranslations: BrazeLocaleTranslation[] = [];
  try {
    localeTranslations = await input.client.getCanvasTranslations({
      workflowId: input.workflowId,
      stepId: input.stepId,
      messageVariationId: input.messageVariationId,
      postLaunchDraftVersion: loaded.postLaunchDraft,
    });
  } catch (error) {
    if (!isNoMultiLanguage(error)) {
      throw error;
    }
  }

  return upsertImportedVariation({
    ...input,
    sourceId,
    resourceKind: "canvas_step",
    sourcePath: buildBrazeCanvasSourcePath({
      workflowId: input.workflowId,
      canvasName: input.canvasName,
      stepId: input.stepId,
      stepName: input.stepName,
      messageVariationId: input.messageVariationId,
      variationName: input.variationName,
    }),
    sourceName: [input.canvasName, input.stepName, input.variationName].filter(Boolean).join(" / "),
    sourceMap,
    localeTranslations,
    campaignId: null,
    workflowId: input.workflowId,
    stepId: input.stepId,
  });
}

async function upsertImportedVariation(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  workflowRunId?: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToBraze>;
  policy: "seed_empty" | "refresh_imported" | "overwrite_all";
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  existing: Map<string, typeof schema.brazeCampaignSyncStates.$inferSelect>;
  sourceId: string;
  resourceKind: "campaign" | "canvas_step";
  sourcePath: string;
  sourceName: string;
  sourceMap: BrazeTranslationMap;
  localeTranslations: BrazeLocaleTranslation[];
  campaignId: string | null;
  workflowId: string | null;
  stepId: string | null;
  messageVariationId: string;
  lastEdited?: string;
  sourceLocale: string;
}): Promise<ImportBrazeCampaignsResult> {
  const hash = hashBrazeTranslationMap(input.sourceMap);
  const previous = input.existing.get(input.sourceId);
  const sourceFileId = await writeBrazeJsonSource({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    hash,
    previousHash: previous?.sourceContentHash,
    sourceLocale: input.sourceLocale,
    json: serializeBrazeTranslationMap(input.sourceMap),
    workflowRunId: input.workflowRunId,
  });
  if (!sourceFileId) {
    await persistSyncState({
      ...input,
      hash,
      localeIds: previous?.localeIds ?? {},
      importedHashes: previous?.importedTranslationHashes ?? {},
      status: "import_failed",
      lastError: { message: "Failed to write Braze campaign source file." },
    });
    return { imported: 0, skipped: 0, failed: 1, jobsCreated: 0 };
  }

  const { localeIds } = mapProjectLocalesToBrazeLocaleIds({
    projectLocales: input.localeMapping.jobTargetLocales,
    brazeLocales: localesFromTranslations(input.localeTranslations),
  });
  const translationByLocaleId = new Map(
    input.localeTranslations
      .filter((entry) => entry.locale.uuid)
      .map((entry) => [entry.locale.uuid, readBrazeTranslationMap(entry.translation_map)]),
  );
  const importedHashes = { ...previous?.importedTranslationHashes };
  const translationService = new ProjectTranslationService();
  const leftover: string[] = [];

  for (const projectLocale of input.localeMapping.jobTargetLocales) {
    const localeId = localeIds[projectLocale];
    const remoteMap = localeId ? translationByLocaleId.get(localeId) : undefined;
    const presence = await loadBrazeLocalePresence({
      translationService,
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: projectLocale,
      importedHash: importedHashes[projectLocale],
    });
    if (!remoteMap || Object.keys(remoteMap).length === 0) {
      leftover.push(projectLocale);
      continue;
    }
    const incomingHash = hashBrazeTranslationMap(remoteMap);
    const action = decideBrazeExistingTranslationAction({
      policy: input.policy,
      incomingHash,
      presence: presence.presence,
    });
    if (action === "skip") {
      continue;
    }
    const result = await importApprovedProjectTranslationsFromEntries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: projectLocale,
      entries: remoteMap,
    });
    if (result.imported > 0) {
      importedHashes[projectLocale] = incomingHash;
    } else {
      leftover.push(projectLocale);
    }
  }

  leftover.push(
    ...input.localeMapping.jobTargetLocales.filter(
      (locale) => !importedHashes[locale] && !leftover.includes(locale),
    ),
  );

  const jobId = await maybeCreateBrazeJob({
    organizationId: input.organizationId,
    automation: input.automation,
    projectId: input.projectId,
    sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: leftover,
    openJobs: input.openJobs,
  });

  await persistSyncState({
    ...input,
    hash,
    localeIds,
    importedHashes,
    status: "active",
    lastError: null,
  });

  return {
    imported: 1,
    skipped: 0,
    failed: 0,
    jobsCreated: jobId ? 1 : 0,
  };
}

async function writeBrazeJsonSource(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  hash: string;
  previousHash?: string;
  sourceLocale: string;
  json: string;
  workflowRunId?: string;
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
      filename: input.sourcePath.split("/").pop() ?? "campaign.json",
      contentType: "application/json",
      content: new TextEncoder().encode(input.json),
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

async function persistSyncState(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  sourceId: string;
  resourceKind: "campaign" | "canvas_step";
  sourcePath: string;
  sourceName: string;
  sourceLocale: string;
  campaignId: string | null;
  workflowId: string | null;
  stepId: string | null;
  messageVariationId: string;
  lastEdited?: string;
  hash: string;
  sourceMap: BrazeTranslationMap;
  localeIds: Record<string, string>;
  importedHashes: Record<string, string>;
  status: "active" | "import_failed";
  lastError: Record<string, unknown> | null;
}) {
  const sourceUpdatedAt = input.lastEdited ? new Date(input.lastEdited) : null;
  await db
    .insert(schema.brazeCampaignSyncStates)
    .values({
      organizationId: input.organizationId,
      automationId: input.automation.id,
      projectId: input.projectId,
      resourceKind: input.resourceKind,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      sourcePath: input.sourcePath,
      campaignId: input.campaignId,
      workflowId: input.workflowId,
      stepId: input.stepId,
      messageVariationId: input.messageVariationId,
      sourceLocale: input.sourceLocale,
      sourceUpdatedAt:
        sourceUpdatedAt && !Number.isNaN(sourceUpdatedAt.getTime()) ? sourceUpdatedAt : null,
      sourceContentHash: input.hash,
      translationKeys: Object.keys(input.sourceMap).toSorted((left, right) =>
        left.localeCompare(right),
      ),
      localeIds: input.localeIds,
      importedTranslationHashes: input.importedHashes,
      lastImportedAt: new Date(),
      status: input.status,
      lastError: input.lastError,
    })
    .onConflictDoUpdate({
      target: [
        schema.brazeCampaignSyncStates.organizationId,
        schema.brazeCampaignSyncStates.automationId,
        schema.brazeCampaignSyncStates.resourceKind,
        schema.brazeCampaignSyncStates.sourceId,
      ],
      set: {
        sourceName: input.sourceName,
        sourcePath: input.sourcePath,
        campaignId: input.campaignId,
        workflowId: input.workflowId,
        stepId: input.stepId,
        messageVariationId: input.messageVariationId,
        sourceLocale: input.sourceLocale,
        sourceUpdatedAt:
          sourceUpdatedAt && !Number.isNaN(sourceUpdatedAt.getTime()) ? sourceUpdatedAt : null,
        sourceContentHash: input.hash,
        translationKeys: Object.keys(input.sourceMap).toSorted((left, right) =>
          left.localeCompare(right),
        ),
        localeIds: input.localeIds,
        importedTranslationHashes: input.importedHashes,
        lastImportedAt: new Date(),
        status: input.status,
        lastError: input.lastError,
        updatedAt: new Date(),
      },
    });
}

async function maybeCreateBrazeJob(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
}): Promise<string | undefined> {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  const targetLocales = leftoverBrazeJobLocalesNotCoveredByOpenJobs({
    leftoverLocales: intersectBrazeJobLocales(
      input.targetLocales,
      createJob?.targetLocales,
      createJob?.useProjectTargetLocales,
    ),
    sourceFileId: input.sourceFileId,
    openJobs: input.openJobs,
  });
  if (!createJob?.enabled || targetLocales.length === 0) {
    return undefined;
  }
  const created = await createFileTranslationJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales,
    fileFormat: "json",
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
  input.openJobs.push({ sourceFileId: input.sourceFileId, targetLocales });
  return created.jobId;
}

async function loadOpenBrazeFileTranslationJobs(input: {
  organizationId: string;
  projectId: string;
}): Promise<Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>> {
  const rows = await db
    .select({ inputPayload: schema.jobs.inputPayload })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.jobs.kind, "translation"),
        inArray(schema.jobs.status, [...INTERCOM_IMPORT_OPEN_JOB_STATUSES]),
      ),
    );
  return rows.map((row) => ({
    sourceFileId: readFileTranslationJobSourceFileId(row.inputPayload),
    targetLocales: readFileTranslationJobTargetLocales(row.inputPayload),
  }));
}

async function loadBrazeLocalePresence(input: {
  translationService: ProjectTranslationService;
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  importedHash?: string;
}) {
  const sourceFile = await input.translationService.getRepositorySourceFileByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (!sourceFile) {
    return {
      presence: brazeTranslationPresence({
        importedHash: input.importedHash,
        translatedKeyCount: 0,
      }),
    };
  }
  const keys = await input.translationService.listKeysForFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.id,
    targetLocale: input.targetLocale,
  });
  const translations = await input.translationService.getTranslationsByKeyIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyIds: keys.map((key) => key.id),
    targetLocale: input.targetLocale,
  });
  return {
    presence: brazeTranslationPresence({
      importedHash: input.importedHash,
      translatedKeyCount: translations.filter((row) => (row.text ?? "").trim().length > 0).length,
      provenances: translations.map((row) => row.provenance),
    }),
    sourceKeyCount: keys.filter((key) => !key.isHidden).length,
  };
}
