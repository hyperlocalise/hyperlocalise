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
  CustomerIoApiError,
  getCustomerIoBroadcastActionTranslation,
  getCustomerIoCampaignActionTranslation,
  getCustomerIoNewsletterActionTranslation,
  getCustomerIoTransactionalActionTranslation,
  listCustomerIoBroadcastActions,
  listCustomerIoBroadcasts,
  listCustomerIoCampaignActions,
  listCustomerIoCampaigns,
  listCustomerIoNewsletterActions,
  listCustomerIoNewsletters,
  listCustomerIoTransactionalActions,
  listCustomerIoTransactionalMessages,
  type CustomerIoAction,
} from "./client";
import type { CustomerIoResourceKind } from "./constants";
import { loadCustomerIoAutomationClient, type CustomerIoAutomationClient } from "./credentials";
import {
  customerIoTranslationPresence,
  decideCustomerIoExistingTranslationAction,
  DEFAULT_CUSTOMER_IO_EXISTING_TRANSLATION_POLICY,
  isCustomerIoExistingTranslationPolicy,
} from "./existing-translation-policy";
import {
  intersectCustomerIoJobLocales,
  leftoverCustomerIoJobLocalesNotCoveredByOpenJobs,
} from "./job-locales";
import { mapProjectLocalesToCustomerIo } from "./locale";
import {
  buildCustomerIoBroadcastSourcePath,
  buildCustomerIoCampaignSourcePath,
  buildCustomerIoNewsletterSourcePath,
  buildCustomerIoTransactionalSourcePath,
  customerIoTranslationMapFromRemote,
  extractCustomerIoActionStrings,
  hashCustomerIoTranslationMap,
  isCustomerIoLocalizableActionType,
  serializeCustomerIoTranslationMap,
  type CustomerIoTranslationMap,
} from "./translation-map";
import {
  buildCustomerIoEmailSourcePath,
  hashCustomerIoEmailEnvelope,
  seedEntriesForCustomerIoEmailFields,
  serializeCustomerIoEmailEnvelope,
} from "./html-envelope";

const logger = createLogger("import-customer-io-campaigns");
const jobQueue = createTranslationJobEventQueue();
export const CUSTOMER_IO_IMPORT_CONCURRENCY = 3;

export function selectedCustomerIoResourceIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

export function shouldListAllCustomerIoResources(ids: readonly string[]): boolean {
  return selectedCustomerIoResourceIds(ids).length === 0;
}

export function isCustomerIoLocaleImportComplete(input: {
  sourceMap: CustomerIoTranslationMap;
  remoteMap: CustomerIoTranslationMap;
  importedCount: number;
}): boolean {
  if (input.importedCount <= 0) {
    return false;
  }
  const sourceKeys = Object.keys(input.sourceMap);
  if (sourceKeys.length === 0) {
    return false;
  }
  return sourceKeys.every((key) => (input.remoteMap[key] ?? "").trim().length > 0);
}

export type ImportCustomerIoCampaignsResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  broadcasts: string[];
  unmappedProjectTargets: string[];
};

export type CustomerIoImportResource = {
  kind: CustomerIoResourceKind;
  id: string;
  name: string;
};

type CustomerIoLocaleMapping = ReturnType<typeof mapProjectLocalesToCustomerIo>;

function permissionErrorMessage(error: unknown): string {
  if (error instanceof CustomerIoApiError && error.code === "customer_io_forbidden") {
    return "This API key is missing Customer.io permission for this resource.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function shouldTreatRemoteTranslationAsEmpty(error: unknown): boolean {
  return error instanceof CustomerIoApiError && error.status === 404;
}

export async function runImportCustomerIoCampaigns(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string;
}): Promise<ImportCustomerIoCampaignsResult> {
  const config = input.automation.toolConfig.customerIo;
  if (!config?.enabled) {
    return {
      imported: 0,
      skipped: 0,
      failed: 0,
      jobsCreated: 0,
      broadcasts: [],
      unmappedProjectTargets: [],
    };
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return {
      imported: 0,
      skipped: 0,
      failed: 0,
      jobsCreated: 0,
      broadcasts: [],
      unmappedProjectTargets: [],
    };
  }

  const loaded = await loadCustomerIoAutomationClient({
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
    return {
      imported: 0,
      skipped: 0,
      failed: 0,
      jobsCreated: 0,
      broadcasts: [],
      unmappedProjectTargets: [],
    };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToCustomerIo({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
  });
  const sourceSuffix = localeMapping.sourceSuffix;
  if (!sourceSuffix) {
    return {
      imported: 0,
      skipped: 0,
      failed: 0,
      jobsCreated: 0,
      broadcasts: [],
      unmappedProjectTargets: [],
    };
  }

  const policy = isCustomerIoExistingTranslationPolicy(config.existingTranslationPolicy)
    ? config.existingTranslationPolicy
    : DEFAULT_CUSTOMER_IO_EXISTING_TRANSLATION_POLICY;

  const openJobs = await loadOpenCustomerIoFileTranslationJobs({
    organizationId: input.organizationId,
    projectId,
  });

  const resources = await resolveCustomerIoImportResources(loaded.value, {
    broadcastIds: selectedCustomerIoResourceIds(config.broadcastIds),
    campaignIds: selectedCustomerIoResourceIds(config.campaignIds),
    newsletterIds: selectedCustomerIoResourceIds(config.newsletterIds ?? []),
    transactionalMessageIds: selectedCustomerIoResourceIds(config.transactionalMessageIds ?? []),
  });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let jobsCreated = 0;
  const resourceNames: string[] = [];

  const results = await mapWithConcurrency(
    resources,
    CUSTOMER_IO_IMPORT_CONCURRENCY,
    async (resource) => {
      try {
        const totals = await importCustomerIoResource({
          organizationId: input.organizationId,
          automation: input.automation,
          projectId,
          workflowRunId: input.workflowRunId,
          client: loaded.value,
          localeMapping,
          policy,
          openJobs,
          resource,
          sourceLocale: sourceSuffix,
        });
        return { ...totals, name: resource.name };
      } catch (error) {
        logger.warn({ error: permissionErrorMessage(error) }, "customer.io import failed");
        return { imported: 0, skipped: 0, failed: 1, jobsCreated: 0, name: null as string | null };
      }
    },
  );

  for (const result of results) {
    imported += result.imported;
    skipped += result.skipped;
    failed += result.failed;
    jobsCreated += result.jobsCreated;
    if (result.name) {
      resourceNames.push(result.name);
    }
  }

  return {
    imported,
    skipped,
    failed,
    jobsCreated,
    broadcasts: resourceNames,
    unmappedProjectTargets: localeMapping.unmappedProjectTargets,
  };
}

export async function resolveCustomerIoImportResources(
  client: CustomerIoAutomationClient,
  ids: {
    broadcastIds: string[];
    campaignIds: string[];
    newsletterIds?: string[];
    transactionalMessageIds?: string[];
  },
): Promise<CustomerIoImportResource[]> {
  const [broadcasts, campaigns, newsletters, transactionalMessages] = await Promise.all([
    listCustomerIoBroadcasts({ apiKey: client.apiKey, region: client.region }),
    listCustomerIoCampaigns({ apiKey: client.apiKey, region: client.region }),
    listCustomerIoNewsletters({ apiKey: client.apiKey, region: client.region }),
    listCustomerIoTransactionalMessages({ apiKey: client.apiKey, region: client.region }),
  ]);
  const broadcastFilter = new Set(ids.broadcastIds);
  const campaignFilter = new Set(ids.campaignIds);
  const newsletterFilter = new Set(ids.newsletterIds ?? []);
  const transactionalFilter = new Set(ids.transactionalMessageIds ?? []);
  const resources: CustomerIoImportResource[] = [];
  for (const broadcast of broadcasts) {
    if (broadcastFilter.size > 0 && !broadcastFilter.has(broadcast.id)) {
      continue;
    }
    resources.push({ kind: "broadcast", id: broadcast.id, name: broadcast.name });
  }
  for (const campaign of campaigns) {
    if (campaignFilter.size > 0 && !campaignFilter.has(campaign.id)) {
      continue;
    }
    resources.push({ kind: "campaign", id: campaign.id, name: campaign.name });
  }
  for (const newsletter of newsletters) {
    if (newsletterFilter.size > 0 && !newsletterFilter.has(newsletter.id)) {
      continue;
    }
    resources.push({ kind: "newsletter", id: newsletter.id, name: newsletter.name });
  }
  for (const message of transactionalMessages) {
    if (transactionalFilter.size > 0 && !transactionalFilter.has(message.id)) {
      continue;
    }
    resources.push({ kind: "transactional", id: message.id, name: message.name });
  }
  return resources;
}

async function importCustomerIoResource(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  workflowRunId?: string;
  client: CustomerIoAutomationClient;
  localeMapping: CustomerIoLocaleMapping;
  policy: "seed_empty" | "refresh_imported" | "overwrite_all";
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  resource: CustomerIoImportResource;
  sourceLocale: string;
}): Promise<ImportCustomerIoCampaignsResult> {
  const actions =
    input.resource.kind === "broadcast"
      ? await listCustomerIoBroadcastActions({
          apiKey: input.client.apiKey,
          region: input.client.region,
          broadcastId: input.resource.id,
        })
      : input.resource.kind === "campaign"
        ? await listCustomerIoCampaignActions({
            apiKey: input.client.apiKey,
            region: input.client.region,
            campaignId: input.resource.id,
          })
        : input.resource.kind === "newsletter"
          ? await listCustomerIoNewsletterActions({
              apiKey: input.client.apiKey,
              region: input.client.region,
              newsletterId: input.resource.id,
            })
          : await listCustomerIoTransactionalActions({
              apiKey: input.client.apiKey,
              region: input.client.region,
              transactionalMessageId: input.resource.id,
            });

  const totals: ImportCustomerIoCampaignsResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    jobsCreated: 0,
    broadcasts: [],
    unmappedProjectTargets: [],
  };

  for (const action of actions) {
    if (!isCustomerIoLocalizableActionType(action.type)) {
      totals.skipped += 1;
      continue;
    }
    // Default-language content only: translated variants import as approved entries.
    if (action.language.trim() !== "") {
      totals.skipped += 1;
      continue;
    }
    const result = await importCustomerIoAction({ ...input, action });
    totals.imported += result.imported;
    totals.skipped += result.skipped;
    totals.failed += result.failed;
    totals.jobsCreated += result.jobsCreated;
  }
  return totals;
}

async function importCustomerIoAction(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  workflowRunId?: string;
  client: CustomerIoAutomationClient;
  localeMapping: CustomerIoLocaleMapping;
  policy: "seed_empty" | "refresh_imported" | "overwrite_all";
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
  resource: CustomerIoImportResource;
  action: CustomerIoAction;
  sourceLocale: string;
}): Promise<ImportCustomerIoCampaignsResult> {
  const sourceMap = extractCustomerIoActionStrings(input.action);
  if (Object.keys(sourceMap).length === 0) {
    return {
      imported: 0,
      skipped: 1,
      failed: 0,
      jobsCreated: 0,
      broadcasts: [],
      unmappedProjectTargets: [],
    };
  }

  // Email actions store as HTML envelopes (body as HTML, other fields as
  // field blocks); every other localizable type keeps the JSON map.
  const isEmail = input.action.type.trim().toLowerCase() === "email";
  const emailHtml = isEmail
    ? serializeCustomerIoEmailEnvelope({
        subject: sourceMap.subject ?? "",
        preheader_text: sourceMap.preheader_text,
        body: sourceMap.body ?? "",
      })
    : null;

  const emailKind =
    input.resource.kind === "broadcast"
      ? ("broadcasts" as const)
      : input.resource.kind === "campaign"
        ? ("campaigns" as const)
        : input.resource.kind === "newsletter"
          ? ("newsletters" as const)
          : ("transactional" as const);
  const sourcePath =
    isEmail && emailHtml
      ? buildCustomerIoEmailSourcePath({
          kind: emailKind,
          resourceId: input.resource.id,
          actionId: input.action.id,
        })
      : input.resource.kind === "broadcast"
        ? buildCustomerIoBroadcastSourcePath({
            broadcastId: input.resource.id,
            actionId: input.action.id,
          })
        : input.resource.kind === "campaign"
          ? buildCustomerIoCampaignSourcePath({
              campaignId: input.resource.id,
              actionId: input.action.id,
            })
          : input.resource.kind === "newsletter"
            ? buildCustomerIoNewsletterSourcePath({
                newsletterId: input.resource.id,
                actionId: input.action.id,
              })
            : buildCustomerIoTransactionalSourcePath({
                transactionalMessageId: input.resource.id,
                actionId: input.action.id,
              });

  const hash =
    isEmail && emailHtml
      ? hashCustomerIoEmailEnvelope(emailHtml)
      : hashCustomerIoTranslationMap(sourceMap);
  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
  });
  const sourceUnchanged = latest?.sourceHash === hash;

  const remoteByLocale = new Map<string, CustomerIoTranslationMap>();
  for (let index = 0; index < input.localeMapping.jobTargetLocales.length; index += 1) {
    const projectLocale = input.localeMapping.jobTargetLocales[index];
    const suffix = input.localeMapping.customerIoSuffixes[index];
    if (!projectLocale || !suffix) {
      continue;
    }
    try {
      const remote =
        input.resource.kind === "broadcast"
          ? await getCustomerIoBroadcastActionTranslation({
              apiKey: input.client.apiKey,
              region: input.client.region,
              broadcastId: input.resource.id,
              actionId: input.action.id,
              language: suffix,
            })
          : input.resource.kind === "campaign"
            ? await getCustomerIoCampaignActionTranslation({
                apiKey: input.client.apiKey,
                region: input.client.region,
                campaignId: input.resource.id,
                actionId: input.action.id,
                language: suffix,
              })
            : input.resource.kind === "newsletter"
              ? await getCustomerIoNewsletterActionTranslation({
                  apiKey: input.client.apiKey,
                  region: input.client.region,
                  newsletterId: input.resource.id,
                  actionId: input.action.id,
                  language: suffix,
                })
              : await getCustomerIoTransactionalActionTranslation({
                  apiKey: input.client.apiKey,
                  region: input.client.region,
                  transactionalMessageId: input.resource.id,
                  actionId: input.action.id,
                  language: suffix,
                });
      if (remote) {
        remoteByLocale.set(
          projectLocale,
          customerIoTranslationMapFromRemote({ type: input.action.type, ...remote }),
        );
      }
    } catch (error) {
      if (!shouldTreatRemoteTranslationAsEmpty(error)) {
        throw error;
      }
    }
  }

  const translationService = new ProjectTranslationService();
  const importedHashes: Record<string, string> = {};
  const leftover: string[] = [];

  for (const projectLocale of input.localeMapping.jobTargetLocales) {
    const remoteMap = remoteByLocale.get(projectLocale);
    if (!remoteMap || Object.keys(remoteMap).length === 0) {
      leftover.push(projectLocale);
      continue;
    }
    const presence = await loadCustomerIoLocalePresence({
      translationService,
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
      targetLocale: projectLocale,
    });
    const incomingHash = hashCustomerIoTranslationMap(remoteMap);
    const action = decideCustomerIoExistingTranslationAction({
      policy: input.policy,
      incomingHash,
      presence: presence.presence,
    });
    if (action === "skip") {
      continue;
    }
    // Email bodies hold many HTML text nodes that cannot map to a whole-body
    // remote string, so only single-text fields seed; the body always goes
    // through Jobs.
    const seedEntries =
      isEmail && emailHtml
        ? seedEntriesForCustomerIoEmailFields({ sourceHtml: emailHtml, sourceMap, remoteMap })
        : remoteMap;
    const result = await importApprovedProjectTranslationsFromEntries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath,
      targetLocale: projectLocale,
      entries: seedEntries,
    });
    if (
      isCustomerIoLocaleImportComplete({
        sourceMap,
        remoteMap,
        importedCount: result.imported,
      })
    ) {
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

  const sourceFileId = await writeCustomerIoActionSource({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
    hash,
    sourceUnchanged,
    sourceLocale: input.sourceLocale,
    content: isEmail && emailHtml ? emailHtml : serializeCustomerIoTranslationMap(sourceMap),
    contentType: isEmail ? "text/html" : "application/json",
    filename: isEmail ? "message.html" : "message.json",
    workflowRunId: input.workflowRunId,
  });
  if (!sourceFileId) {
    return {
      imported: 0,
      skipped: 0,
      failed: 1,
      jobsCreated: 0,
      broadcasts: [],
      unmappedProjectTargets: [],
    };
  }

  const jobId = await maybeCreateCustomerIoJob({
    organizationId: input.organizationId,
    automation: input.automation,
    projectId: input.projectId,
    sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: leftover,
    fileFormat: isEmail ? "html" : "json",
    openJobs: input.openJobs,
  });

  return {
    imported: 1,
    skipped: 0,
    failed: 0,
    jobsCreated: jobId ? 1 : 0,
    broadcasts: [],
    unmappedProjectTargets: [],
  };
}

async function writeCustomerIoActionSource(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  hash: string;
  sourceUnchanged?: boolean;
  sourceLocale: string;
  content: string;
  contentType: "application/json" | "text/html";
  filename: string;
  workflowRunId?: string;
}): Promise<string | null> {
  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (input.sourceUnchanged && latest?.ingestState === "ingested" && latest.storedFileId) {
    return latest.storedFileId;
  }
  if (input.sourceUnchanged && latest?.id) {
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
    uploadSurface: "customer_io_automation",
    workflowRunId: input.workflowRunId,
    file: {
      filename: input.filename,
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

async function maybeCreateCustomerIoJob(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
  fileFormat: "json" | "html";
  openJobs: Array<{ sourceFileId: string | null; targetLocales: readonly string[] }>;
}): Promise<string | undefined> {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  const targetLocales = leftoverCustomerIoJobLocalesNotCoveredByOpenJobs({
    leftoverLocales: intersectCustomerIoJobLocales(
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
    fileFormat: input.fileFormat,
    metadata: { uploadSurface: "customer_io_automation" },
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

async function loadOpenCustomerIoFileTranslationJobs(input: {
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

async function loadCustomerIoLocalePresence(input: {
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
      presence: customerIoTranslationPresence({
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
    presence: customerIoTranslationPresence({
      importedHash: input.importedHash,
      translatedKeyCount: translations.filter((row) => (row.text ?? "").trim().length > 0).length,
      provenances: translations.map((row) => row.provenance),
    }),
    sourceKeyCount: keys.filter((key) => !key.isHidden).length,
  };
}
