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
import {
  getLatestRepositorySourceFileVersion,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import {
  CustomerIoApiError,
  getCustomerIoBroadcastActionTranslation,
  getCustomerIoCampaignActionTranslation,
  getCustomerIoNewsletterActionTranslation,
  getCustomerIoResourceAction,
  getCustomerIoTransactionalActionTranslation,
  listCustomerIoBroadcastActions,
  listCustomerIoCampaignActions,
  listCustomerIoNewsletterActions,
  listCustomerIoTransactionalActions,
  updateCustomerIoBroadcastActionTranslation,
  updateCustomerIoCampaignActionTranslation,
  updateCustomerIoNewsletterActionTranslation,
  updateCustomerIoTransactionalActionTranslation,
  type CustomerIoAction,
  type CustomerIoActionTranslation,
  type CustomerIoActionTranslationPayload,
} from "./client";
import { loadCustomerIoAutomationClient, type CustomerIoAutomationClient } from "./credentials";
import {
  resolveCustomerIoImportResources,
  selectedCustomerIoResourceIds,
  type CustomerIoImportResource,
} from "./import-customer-io-campaigns";
import { mapProjectLocalesToCustomerIo } from "./locale";
import {
  buildCustomerIoActionTranslationPayload,
  buildCustomerIoBroadcastSourcePath,
  buildCustomerIoCampaignSourcePath,
  buildCustomerIoNewsletterSourcePath,
  buildCustomerIoTransactionalSourcePath,
  customerIoTranslationMapFromRemote,
  hashCustomerIoTranslationMap,
  isCustomerIoLocalizableActionType,
  mergeCustomerIoTranslationMap,
  parseCustomerIoTranslationMapJson,
  type CustomerIoTranslationMap,
} from "./translation-map";
import { parseCustomerIoEmailEnvelope } from "./html-envelope";
import { applyHtmlIngestTranslations } from "@/lib/projects/files/html-ingest-entries";

const logger = createLogger("push-customer-io-campaigns");
export const CUSTOMER_IO_PUSH_CONCURRENCY = 3;

export function readCustomerIoPushSourcePaths(
  inputSnapshot: Record<string, unknown> | null | undefined,
): string[] | undefined {
  const raw = inputSnapshot?.sourcePaths;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

export type PushCustomerIoCampaignsResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  itemsProcessed: number;
};

function envelopeFieldsToMap(envelope: {
  subject: string;
  preheader_text?: string;
  body: string;
}): CustomerIoTranslationMap {
  const map: CustomerIoTranslationMap = {};
  if (envelope.subject) {
    map.subject = envelope.subject;
  }
  if (envelope.preheader_text) {
    map.preheader_text = envelope.preheader_text;
  }
  if (envelope.body) {
    map.body = envelope.body;
  }
  return map;
}

function permissionErrorMessage(error: unknown): string {
  if (error instanceof CustomerIoApiError && error.code === "customer_io_forbidden") {
    return "This API key is missing Customer.io permission for this resource.";
  }
  if (error instanceof CustomerIoApiError && error.code === "customer_io_translation_missing") {
    return "Enable this language on the Customer.io message first, then push again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isMissingTranslation(error: unknown): boolean {
  return error instanceof CustomerIoApiError && error.code === "customer_io_translation_missing";
}

function isRemoteNewerThanSource(
  remoteUpdatedAt: string | null | undefined,
  sourceCreatedAt: Date | null,
): boolean {
  if (!remoteUpdatedAt || !sourceCreatedAt) {
    return false;
  }
  const remoteTime = new Date(remoteUpdatedAt).getTime();
  return !Number.isNaN(remoteTime) && remoteTime > sourceCreatedAt.getTime();
}

export async function runPushCustomerIoCampaigns(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
}): Promise<PushCustomerIoCampaignsResult> {
  const config = input.automation.toolConfig.customerIo;
  if (!config?.enabled) {
    return { pushedLocales: 0, skippedLocales: 0, failedLocales: 0, itemsProcessed: 0 };
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return { pushedLocales: 0, skippedLocales: 0, failedLocales: 0, itemsProcessed: 0 };
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
    return { pushedLocales: 0, skippedLocales: 0, failedLocales: 0, itemsProcessed: 0 };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToCustomerIo({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
  });
  if (!localeMapping.sourceSuffix) {
    return { pushedLocales: 0, skippedLocales: 0, failedLocales: 0, itemsProcessed: 0 };
  }

  const resources = await resolveCustomerIoImportResources(loaded.value, {
    broadcastIds: selectedCustomerIoResourceIds(config.broadcastIds),
    campaignIds: selectedCustomerIoResourceIds(config.campaignIds),
    newsletterIds: selectedCustomerIoResourceIds(config.newsletterIds ?? []),
    transactionalMessageIds: selectedCustomerIoResourceIds(config.transactionalMessageIds ?? []),
  });

  const translationService = new ProjectTranslationService();
  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;
  let itemsProcessed = 0;

  const sourceFilter = input.sourcePaths ? new Set(input.sourcePaths) : null;

  for (const resource of resources) {
    const actions = await listCustomerIoResourceActions(loaded.value, resource);
    const defaultActions = actions.filter(
      (action) => isCustomerIoLocalizableActionType(action.type) && action.language.trim() === "",
    );
    if (
      (resource.kind === "newsletter" || resource.kind === "transactional") &&
      defaultActions.length > 1
    ) {
      // Newsletter/transactional translations share one per-language slot, so
      // pushing several default variants of the same message would overwrite
      // each other (last wins). Skip A/B-tested messages until variant-level
      // targeting exists.
      logger.warn(
        { resourceKind: resource.kind, resourceId: resource.id },
        "customer.io push skipped resource with multiple default variants",
      );
      continue;
    }
    for (const action of defaultActions) {
      const sourcePath = buildCustomerIoResourceSourcePath(resource, action.id);
      if (sourceFilter && !sourceFilter.has(sourcePath)) {
        continue;
      }
      itemsProcessed += 1;
      const result = await pushCustomerIoAction({
        organizationId: input.organizationId,
        projectId,
        client: loaded.value,
        translationService,
        resource,
        action,
        sourcePath,
        targetLocales: localeMapping.jobTargetLocales,
        languageTags: localeMapping.customerIoSuffixes,
        overwriteWhenRemoteNewer: config.overwriteWhenRemoteNewer !== false,
      });
      pushedLocales += result.pushedLocales;
      skippedLocales += result.skippedLocales;
      failedLocales += result.failedLocales;
    }
  }

  return { pushedLocales, skippedLocales, failedLocales, itemsProcessed };
}

function customerIoResourcePath(resource: CustomerIoImportResource): string {
  switch (resource.kind) {
    case "broadcast":
      return `/broadcasts/${resource.id}`;
    case "campaign":
      return `/campaigns/${resource.id}`;
    case "newsletter":
      return `/newsletters/${resource.id}`;
    case "transactional":
      return `/transactional/${resource.id}`;
  }
}

function buildCustomerIoResourceSourcePath(
  resource: CustomerIoImportResource,
  actionId: string,
): string {
  switch (resource.kind) {
    case "broadcast":
      return buildCustomerIoBroadcastSourcePath({ broadcastId: resource.id, actionId });
    case "campaign":
      return buildCustomerIoCampaignSourcePath({ campaignId: resource.id, actionId });
    case "newsletter":
      return buildCustomerIoNewsletterSourcePath({ newsletterId: resource.id, actionId });
    case "transactional":
      return buildCustomerIoTransactionalSourcePath({
        transactionalMessageId: resource.id,
        actionId,
      });
  }
}

async function listCustomerIoResourceActions(
  client: CustomerIoAutomationClient,
  resource: CustomerIoImportResource,
): Promise<CustomerIoAction[]> {
  switch (resource.kind) {
    case "broadcast":
      return listCustomerIoBroadcastActions({
        apiKey: client.apiKey,
        region: client.region,
        broadcastId: resource.id,
      });
    case "campaign":
      return listCustomerIoCampaignActions({
        apiKey: client.apiKey,
        region: client.region,
        campaignId: resource.id,
      });
    case "newsletter":
      return listCustomerIoNewsletterActions({
        apiKey: client.apiKey,
        region: client.region,
        newsletterId: resource.id,
      });
    case "transactional":
      return listCustomerIoTransactionalActions({
        apiKey: client.apiKey,
        region: client.region,
        transactionalMessageId: resource.id,
      });
  }
}

async function getCustomerIoResourceTranslation(input: {
  client: CustomerIoAutomationClient;
  resource: CustomerIoImportResource;
  actionId: string;
  language: string;
}): Promise<CustomerIoActionTranslation | null> {
  const { client, resource, actionId, language } = input;
  switch (resource.kind) {
    case "broadcast":
      return getCustomerIoBroadcastActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        broadcastId: resource.id,
        actionId,
        language,
      });
    case "campaign":
      return getCustomerIoCampaignActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        campaignId: resource.id,
        actionId,
        language,
      });
    case "newsletter":
      return getCustomerIoNewsletterActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        newsletterId: resource.id,
        actionId,
        language,
      });
    case "transactional":
      return getCustomerIoTransactionalActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        transactionalMessageId: resource.id,
        actionId,
        language,
      });
  }
}

async function updateCustomerIoResourceTranslation(input: {
  client: CustomerIoAutomationClient;
  resource: CustomerIoImportResource;
  actionId: string;
  language: string;
  payload: CustomerIoActionTranslationPayload;
}): Promise<void> {
  const { client, resource, actionId, language, payload } = input;
  switch (resource.kind) {
    case "broadcast":
      return updateCustomerIoBroadcastActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        broadcastId: resource.id,
        actionId,
        language,
        payload,
      });
    case "campaign":
      return updateCustomerIoCampaignActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        campaignId: resource.id,
        actionId,
        language,
        payload,
      });
    case "newsletter":
      return updateCustomerIoNewsletterActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        newsletterId: resource.id,
        actionId,
        language,
        payload,
      });
    case "transactional":
      return updateCustomerIoTransactionalActionTranslation({
        apiKey: client.apiKey,
        region: client.region,
        transactionalMessageId: resource.id,
        actionId,
        language,
        payload,
      });
  }
}

async function pushCustomerIoAction(input: {
  organizationId: string;
  projectId: string;
  client: CustomerIoAutomationClient;
  translationService: ProjectTranslationService;
  resource: CustomerIoImportResource;
  action: CustomerIoAction;
  sourcePath: string;
  targetLocales: readonly string[];
  languageTags: readonly string[];
  overwriteWhenRemoteNewer: boolean;
}): Promise<{ pushedLocales: number; skippedLocales: number; failedLocales: number }> {
  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;

  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (!latest?.storedFileId) {
    return { pushedLocales, skippedLocales: input.targetLocales.length, failedLocales };
  }
  const stored = await getStoredFileContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: latest.storedFileId,
  });
  const storedText = stored.content.toString("utf8");
  const isEmail = input.action.type.trim().toLowerCase() === "email";
  // Email actions store as HTML envelopes; approved translations arrive keyed
  // by hashed HTML entry and merge back into the stored HTML before push.
  const sourceMap: CustomerIoTranslationMap = isEmail
    ? envelopeFieldsToMap(parseCustomerIoEmailEnvelope(storedText))
    : parseCustomerIoTranslationMapJson(storedText);
  if (Object.keys(sourceMap).length === 0) {
    return { pushedLocales, skippedLocales: input.targetLocales.length, failedLocales };
  }

  const details = await getCustomerIoResourceAction({
    apiKey: input.client.apiKey,
    region: input.client.region,
    resourcePath: customerIoResourcePath(input.resource),
    actionId: input.action.id,
    collectionKey:
      input.resource.kind === "newsletter" || input.resource.kind === "transactional"
        ? "contents"
        : "actions",
  });
  if (!details) {
    return { pushedLocales, skippedLocales: input.targetLocales.length, failedLocales };
  }

  for (let index = 0; index < input.targetLocales.length; index += 1) {
    const projectLocale = input.targetLocales[index];
    const language = input.languageTags[index];
    if (!projectLocale || !language) {
      continue;
    }
    try {
      const approved = await input.translationService.loadAsPrefilledEntries({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: projectLocale,
        approvedTranslationsOnly: true,
        readyTranslationsOnly: true,
      });
      if (approved.translatedKeyCount === 0) {
        skippedLocales += 1;
        continue;
      }

      const remote = await getCustomerIoResourceTranslation({
        client: input.client,
        resource: input.resource,
        actionId: input.action.id,
        language,
      });
      if (!remote) {
        // Language variants are enabled in the Customer.io UI; the API only
        // updates existing variants, so there is nothing to push into yet.
        skippedLocales += 1;
        continue;
      }
      const remoteMap = customerIoTranslationMapFromRemote({ type: details.type, ...remote });
      // Email approvals arrive keyed by hashed HTML entry; substitute them
      // into the stored envelope first so the merge below works per field.
      // Unapproved entries keep stored (source-language) text, matching the
      // JSON flow's source fallback.
      const approvedFields = isEmail
        ? envelopeFieldsToMap(
            parseCustomerIoEmailEnvelope(
              applyHtmlIngestTranslations(storedText, approved.prefilled),
            ),
          )
        : approved.prefilled;
      const translationMap = mergeCustomerIoTranslationMap({
        source: sourceMap,
        remote: remoteMap,
        approved: approvedFields,
      });
      const contentHash = hashCustomerIoTranslationMap(translationMap);
      const remoteHash = hashCustomerIoTranslationMap(remoteMap);
      if (contentHash === remoteHash) {
        skippedLocales += 1;
        continue;
      }
      if (
        !input.overwriteWhenRemoteNewer &&
        isRemoteNewerThanSource(remote.updatedAt, latest.createdAt)
      ) {
        skippedLocales += 1;
        continue;
      }

      const payload = buildCustomerIoActionTranslationPayload(details.type, translationMap);
      try {
        await updateCustomerIoResourceTranslation({
          client: input.client,
          resource: input.resource,
          actionId: input.action.id,
          language,
          payload,
        });
        pushedLocales += 1;
      } catch (error) {
        if (isMissingTranslation(error)) {
          skippedLocales += 1;
          continue;
        }
        throw error;
      }
    } catch (error) {
      logger.warn({ error: permissionErrorMessage(error) }, "customer.io push failed");
      failedLocales += 1;
    }
  }

  return { pushedLocales, skippedLocales, failedLocales };
}
