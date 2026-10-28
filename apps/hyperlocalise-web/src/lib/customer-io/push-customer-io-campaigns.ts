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
import type { CustomerIoResourceKind } from "./constants";
import { loadCustomerIoAutomationClient, type CustomerIoAutomationClient } from "./credentials";
import {
  resolveCustomerIoImportResources,
  selectedCustomerIoActionIds,
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
import {
  parseCustomerIoEmailEnvelope,
  buildCustomerIoEmailSourcePath,
  isCustomerIoHtmlActionType,
} from "./html-envelope";
import {
  createCustomerIoDesignStudioTranslation,
  getCustomerIoDesignStudioEmail,
  getCustomerIoDesignStudioTranslation,
  listCustomerIoDesignStudioEmails,
  matchCustomerIoDesignStudioLanguage,
  resolveCustomerIoDesignStudioEmail,
  updateCustomerIoDesignStudioTranslation,
  type CustomerIoDesignStudioEmailSummary,
  type CustomerIoDesignStudioTranslationContent,
} from "./design-studio-client";
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
  warnings: string[];
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

/**
 * Whether a push failure means "nothing to push into" rather than a real
 * error. The API only updates language variants enabled in the Customer.io
 * UI: a missing variant is 404, while a rejected/unknown language tag (e.g.
 * zh-CN when that locale is not enabled) is 400. Both skip the locale instead
 * of failing the run.
 */
export function isCustomerIoPushSkippedError(error: unknown): boolean {
  return (
    isMissingTranslation(error) || (error instanceof CustomerIoApiError && error.status === 400)
  );
}

/**
 * Whether an App API failure is the Design Studio guard (`Cannot update
 * content managed by Design Studio`): the action's content must be written
 * through the Design Studio API instead.
 */
export function isCustomerIoDesignStudioManagedError(error: unknown): boolean {
  return error instanceof CustomerIoApiError && /design studio/i.test(error.message);
}

/** Design Studio `content` payload for a merged email translation map. */
export function buildCustomerIoDesignStudioTranslationContent(
  map: CustomerIoTranslationMap,
): CustomerIoDesignStudioTranslationContent {
  return {
    subject: map.subject ?? "",
    preheader_text: map.preheader_text ?? "",
    html: map.body ?? "",
  };
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
    return {
      pushedLocales: 0,
      skippedLocales: 0,
      failedLocales: 0,
      itemsProcessed: 0,
      warnings: [],
    };
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return {
      pushedLocales: 0,
      skippedLocales: 0,
      failedLocales: 0,
      itemsProcessed: 0,
      warnings: [],
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
      pushedLocales: 0,
      skippedLocales: 0,
      failedLocales: 0,
      itemsProcessed: 0,
      warnings: [],
    };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToCustomerIo({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
  });
  if (!localeMapping.sourceSuffix) {
    return {
      pushedLocales: 0,
      skippedLocales: 0,
      failedLocales: 0,
      itemsProcessed: 0,
      warnings: [],
    };
  }

  const actionSelections: Record<CustomerIoResourceKind, Record<string, string[]>> = {
    broadcast: config.broadcastActions ?? {},
    campaign: config.campaignActions ?? {},
    newsletter: config.newsletterActions ?? {},
    transactional: config.transactionalMessageActions ?? {},
  };

  const resources = await resolveCustomerIoImportResources(loaded.value, {
    broadcastIds: selectedCustomerIoResourceIds([
      ...config.broadcastIds,
      ...Object.keys(actionSelections.broadcast),
    ]),
    campaignIds: selectedCustomerIoResourceIds([
      ...config.campaignIds,
      ...Object.keys(actionSelections.campaign),
    ]),
    newsletterIds: selectedCustomerIoResourceIds([
      ...(config.newsletterIds ?? []),
      ...Object.keys(actionSelections.newsletter),
    ]),
    transactionalMessageIds: selectedCustomerIoResourceIds([
      ...(config.transactionalMessageIds ?? []),
      ...Object.keys(actionSelections.transactional),
    ]),
  });

  const translationService = new ProjectTranslationService();
  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;
  let itemsProcessed = 0;
  const warnings: string[] = [];
  const pushWarning = (message: string) => {
    if (warnings.length < 20 && !warnings.includes(message)) {
      warnings.push(message);
    }
  };

  const sourceFilter = input.sourcePaths ? new Set(input.sourcePaths) : null;

  for (const resource of resources) {
    const actions = await listCustomerIoResourceActions(loaded.value, resource);
    const selectedIds = selectedCustomerIoActionIds(actionSelections[resource.kind], resource.id);
    const defaultActions = actions.filter(
      (action) =>
        isCustomerIoLocalizableActionType(action.type) &&
        action.language.trim() === "" &&
        (!selectedIds || selectedIds.includes(action.id)),
    );
    // Design Studio-linked emails push through the Design Studio API, so
    // resolve them once per resource. A listing failure falls back to the
    // App API path per action below.
    const needsDesignStudio = defaultActions.some(
      (action) => action.type.trim().toLowerCase() === "email",
    );
    let designStudioEmails: CustomerIoDesignStudioEmailSummary[] | null = null;
    if (needsDesignStudio) {
      try {
        designStudioEmails = await listCustomerIoDesignStudioEmails({
          apiKey: loaded.value.apiKey,
          region: loaded.value.region,
          isLinked: true,
        });
      } catch (error) {
        logger.warn(
          { error: permissionErrorMessage(error) },
          "customer.io design studio list failed",
        );
      }
    }
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
      const sourcePath = buildCustomerIoResourceSourcePath(resource, action.id, action.type);
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
        designStudioEmails,
      });
      pushedLocales += result.pushedLocales;
      skippedLocales += result.skippedLocales;
      failedLocales += result.failedLocales;
      for (const warning of result.warnings) {
        pushWarning(warning);
      }
    }
  }

  return { pushedLocales, skippedLocales, failedLocales, itemsProcessed, warnings };
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

export function buildCustomerIoResourceSourcePath(
  resource: CustomerIoImportResource,
  actionId: string,
  actionType?: string,
): string {
  if (isCustomerIoHtmlActionType(actionType ?? "")) {
    const kind =
      resource.kind === "broadcast"
        ? ("broadcasts" as const)
        : resource.kind === "campaign"
          ? ("campaigns" as const)
          : resource.kind === "newsletter"
            ? ("newsletters" as const)
            : ("transactional" as const);
    return buildCustomerIoEmailSourcePath({
      kind,
      resourceId: resource.id,
      actionId,
    });
  }
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

export async function listCustomerIoResourceActions(
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
  designStudioEmails?: CustomerIoDesignStudioEmailSummary[] | null;
}): Promise<{
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  warnings: string[];
}> {
  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;
  const warnings: string[] = [];
  const pushWarning = (message: string) => {
    if (warnings.length < 20 && !warnings.includes(message)) {
      warnings.push(message);
    }
  };
  const label = `${input.resource.kind} ${input.resource.id} action ${input.action.id}`;

  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (!latest?.storedFileId) {
    pushWarning(`${label}: skipped (no imported file at ${input.sourcePath}; run ingest first)`);
    return { pushedLocales, skippedLocales: input.targetLocales.length, failedLocales, warnings };
  }
  const stored = await getStoredFileContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: latest.storedFileId,
  });
  const storedText = stored.content.toString("utf8");
  const isHtml = isCustomerIoHtmlActionType(input.action.type);
  // HTML actions (email, in_app) store as HTML envelopes; approved
  // translations arrive keyed by hashed HTML entry and merge back into the
  // stored HTML before push.
  const sourceMap: CustomerIoTranslationMap = isHtml
    ? envelopeFieldsToMap(parseCustomerIoEmailEnvelope(storedText))
    : parseCustomerIoTranslationMapJson(storedText);
  if (Object.keys(sourceMap).length === 0) {
    pushWarning(`${label}: skipped (stored file has no translatable entries)`);
    return { pushedLocales, skippedLocales: input.targetLocales.length, failedLocales, warnings };
  }

  // Design Studio-linked email: the App API refuses translation writes, so
  // push through the Design Studio API for the linked email instead.
  let designStudioEmailId = isHtml
    ? parseCustomerIoEmailEnvelope(storedText).designStudioEmailId
    : undefined;
  if (
    !designStudioEmailId &&
    input.action.type.trim().toLowerCase() === "email" &&
    input.designStudioEmails
  ) {
    const resolved = resolveCustomerIoDesignStudioEmail({
      resource: input.resource,
      action: input.action,
      emails: input.designStudioEmails,
    });
    if (resolved) {
      // The stored file still holds compiled App API HTML from before the
      // Design Studio ingest — the App API would refuse the write, so stop
      // here instead of failing per locale.
      pushWarning(
        `${label}: skipped (content is managed by Design Studio; re-run ingest to switch to Design Studio content)`,
      );
      return {
        pushedLocales,
        skippedLocales: input.targetLocales.length,
        failedLocales,
        warnings,
      };
    }
  }
  if (designStudioEmailId) {
    const designStudioResult = await pushCustomerIoDesignStudioAction({
      organizationId: input.organizationId,
      projectId: input.projectId,
      client: input.client,
      translationService: input.translationService,
      resource: input.resource,
      action: input.action,
      sourcePath: input.sourcePath,
      storedText,
      sourceMap,
      emailId: designStudioEmailId,
      sourceCreatedAt: latest.createdAt,
      targetLocales: input.targetLocales,
      languageTags: input.languageTags,
      overwriteWhenRemoteNewer: input.overwriteWhenRemoteNewer,
    });
    pushedLocales += designStudioResult.pushedLocales;
    skippedLocales += designStudioResult.skippedLocales;
    failedLocales += designStudioResult.failedLocales;
    for (const warning of designStudioResult.warnings) {
      pushWarning(warning);
    }
    return { pushedLocales, skippedLocales, failedLocales, warnings };
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
    pushWarning(`${label}: skipped (could not read action details from Customer.io)`);
    return { pushedLocales, skippedLocales: input.targetLocales.length, failedLocales, warnings };
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
        pushWarning(`${label}: skipped ${projectLocale} (no approved translations yet)`);
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
        pushWarning(
          `${label}: skipped ${projectLocale} (enable language ${language} on the message in Customer.io first)`,
        );
        skippedLocales += 1;
        continue;
      }
      const remoteMap = customerIoTranslationMapFromRemote({ type: details.type, ...remote });
      // HTML approvals arrive keyed by hashed HTML entry; substitute them
      // into the stored envelope first so the merge below works per field.
      // Unapproved entries keep stored (source-language) text, matching the
      // JSON flow's source fallback.
      const approvedFields = isHtml
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
        pushWarning(`${label}: skipped ${projectLocale} (already up to date)`);
        skippedLocales += 1;
        continue;
      }
      if (
        !input.overwriteWhenRemoteNewer &&
        isRemoteNewerThanSource(remote.updatedAt, latest.createdAt)
      ) {
        pushWarning(`${label}: skipped ${projectLocale} (remote is newer and overwrite is off)`);
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
        if (isCustomerIoPushSkippedError(error)) {
          const reason =
            error instanceof CustomerIoApiError && /Reason: /.test(error.message)
              ? ` (${error.message.slice(error.message.indexOf("Reason: "))})`
              : "";
          // Design Studio-managed content can only be written through the
          // Design Studio API: name the fix instead of a generic skip.
          const designStudioHint = isCustomerIoDesignStudioManagedError(error)
            ? "; re-run ingest to push through Design Studio"
            : "";
          pushWarning(
            `${label}: skipped ${language} (language variant not writable in Customer.io${reason}${designStudioHint})`,
          );
          skippedLocales += 1;
          continue;
        }
        throw error;
      }
    } catch (error) {
      logger.warn({ error: permissionErrorMessage(error) }, "customer.io push failed");
      pushWarning(`${label}: failed (${permissionErrorMessage(error)})`);
      failedLocales += 1;
    }
  }

  return { pushedLocales, skippedLocales, failedLocales, warnings };
}

function designStudioContentToMap(content: {
  subject: string;
  preheaderText: string;
  html: string;
}): CustomerIoTranslationMap {
  const map: CustomerIoTranslationMap = {};
  if (content.subject) {
    map.subject = content.subject;
  }
  if (content.preheaderText) {
    map.preheader_text = content.preheaderText;
  }
  if (content.html) {
    map.body = content.html;
  }
  return map;
}

/**
 * Push approved translations for a Design Studio-linked email action. Unlike
 * the App API path, a missing language variant is created automatically, and
 * writes land as unpublished drafts — the email must still be published in
 * Customer.io to go live.
 */
async function pushCustomerIoDesignStudioAction(input: {
  organizationId: string;
  projectId: string;
  client: CustomerIoAutomationClient;
  translationService: ProjectTranslationService;
  resource: CustomerIoImportResource;
  action: CustomerIoAction;
  sourcePath: string;
  storedText: string;
  sourceMap: CustomerIoTranslationMap;
  emailId: string;
  sourceCreatedAt: Date | null;
  targetLocales: readonly string[];
  languageTags: readonly string[];
  overwriteWhenRemoteNewer: boolean;
}): Promise<{
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  warnings: string[];
}> {
  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;
  const warnings: string[] = [];
  const pushWarning = (message: string) => {
    if (warnings.length < 20 && !warnings.includes(message)) {
      warnings.push(message);
    }
  };
  const label = `${input.resource.kind} ${input.resource.id} action ${input.action.id}`;

  const email = await getCustomerIoDesignStudioEmail({
    apiKey: input.client.apiKey,
    region: input.client.region,
    emailId: input.emailId,
  });
  if (!email) {
    pushWarning(`${label}: skipped (linked Design Studio email ${input.emailId} was not found)`);
    return { pushedLocales, skippedLocales: input.targetLocales.length, failedLocales, warnings };
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
        pushWarning(`${label}: skipped ${projectLocale} (no approved translations yet)`);
        skippedLocales += 1;
        continue;
      }

      // Address the translation with the email's own language casing
      // (`zh-cn`, not the project tag `zh-CN`).
      const remoteTag = matchCustomerIoDesignStudioLanguage(email.availableLanguages, language);
      let putLanguage: string;
      let remoteMap: CustomerIoTranslationMap;
      let remoteUpdatedAt: string | null;
      if (!remoteTag) {
        await createCustomerIoDesignStudioTranslation({
          apiKey: input.client.apiKey,
          region: input.client.region,
          emailId: email.id,
          language,
        });
        putLanguage = language;
        // A fresh translation inherits the default content.
        remoteMap = designStudioContentToMap(email.content);
        remoteUpdatedAt = null;
      } else {
        putLanguage = remoteTag;
        const remote = await getCustomerIoDesignStudioTranslation({
          apiKey: input.client.apiKey,
          region: input.client.region,
          emailId: email.id,
          language: remoteTag,
        });
        if (!remote) {
          await createCustomerIoDesignStudioTranslation({
            apiKey: input.client.apiKey,
            region: input.client.region,
            emailId: email.id,
            language: remoteTag,
          });
          remoteMap = designStudioContentToMap(email.content);
          remoteUpdatedAt = null;
        } else {
          remoteMap = designStudioContentToMap(remote.content);
          remoteUpdatedAt = remote.updatedAt;
        }
      }

      // HTML approvals arrive keyed by hashed HTML entry; substitute them
      // into the stored envelope first so the merge below works per field.
      const approvedFields = envelopeFieldsToMap(
        parseCustomerIoEmailEnvelope(
          applyHtmlIngestTranslations(input.storedText, approved.prefilled),
        ),
      );
      const translationMap = mergeCustomerIoTranslationMap({
        source: input.sourceMap,
        remote: remoteMap,
        approved: approvedFields,
      });
      const contentHash = hashCustomerIoTranslationMap(translationMap);
      const remoteHash = hashCustomerIoTranslationMap(remoteMap);
      if (contentHash === remoteHash) {
        pushWarning(`${label}: skipped ${projectLocale} (already up to date)`);
        skippedLocales += 1;
        continue;
      }
      if (
        !input.overwriteWhenRemoteNewer &&
        isRemoteNewerThanSource(remoteUpdatedAt, input.sourceCreatedAt)
      ) {
        pushWarning(`${label}: skipped ${projectLocale} (remote is newer and overwrite is off)`);
        skippedLocales += 1;
        continue;
      }

      await updateCustomerIoDesignStudioTranslation({
        apiKey: input.client.apiKey,
        region: input.client.region,
        emailId: email.id,
        language: putLanguage,
        content: buildCustomerIoDesignStudioTranslationContent(translationMap),
      });
      pushedLocales += 1;
    } catch (error) {
      logger.warn({ error: permissionErrorMessage(error) }, "customer.io push failed");
      pushWarning(`${label}: failed (${permissionErrorMessage(error)})`);
      failedLocales += 1;
    }
  }

  if (pushedLocales > 0) {
    pushWarning(
      `${label}: saved as draft in Design Studio (publish the email in Customer.io to go live)`,
    );
  }

  return { pushedLocales, skippedLocales, failedLocales, warnings };
}
