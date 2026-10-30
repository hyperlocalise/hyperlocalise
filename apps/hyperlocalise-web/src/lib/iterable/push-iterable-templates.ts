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
import {
  getLatestRepositorySourceFileVersion,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { IterableApiError, type IterableClient } from "./client";
import {
  ITERABLE_EMAIL_CLIENT_TEMPLATE_PREFIX,
  ITERABLE_INAPP_CLIENT_TEMPLATE_PREFIX,
} from "./constants";
import { loadIterableAutomationClient } from "./credentials";
import { isIterableInPlaceHtmlEditor } from "./editor";
import {
  DEFAULT_ITERABLE_EXISTING_TRANSLATION_POLICY,
  decideIterablePushLocaleAction,
  isIterableExistingTranslationPolicy,
} from "./existing-translation-policy";
import {
  applyApprovedIterableHtmlTranslations,
  hashIterableContent,
  parseIterableEmailEnvelope,
  parseIterableInAppEnvelope,
  parseIterablePushEnvelope,
  parseIterableSmsEnvelope,
  parseIterableSnippetHtml,
  restoreIterableEmailEnvelope,
  restoreIterableInAppEnvelope,
  restoreIterableSnippetContent,
} from "./html-envelope";
import { mapProjectLocalesToIterable } from "./locale";
import { iterableSnippetLocaleCopyName } from "./source-path";

const logger = createLogger("push-iterable-templates");

export type PushIterableTemplatesResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  itemsProcessed: number;
};

export function readIterablePushSourcePaths(
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

function isRemoteLocaleEmpty(error: unknown): boolean {
  return error instanceof IterableApiError && error.status === 404;
}

function isRemoteContentEmpty(value: { html?: string; message?: string }): boolean {
  const html = value.html?.trim() ?? "";
  const message = value.message?.trim() ?? "";
  return !html && !message;
}

export async function runPushIterableTemplates(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
}): Promise<PushIterableTemplatesResult> {
  const config = input.automation.toolConfig.iterable;
  if (!config?.enabled || !config.workosUserId) {
    throw new Error("iterable_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("iterable_project_required");
  }

  const loaded = await loadIterableAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: config.workosUserId,
  });
  if (isErr(loaded)) {
    throw new Error(loaded.error.code);
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
    throw new Error("iterable_native_project_required");
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToIterable({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: config.sourceLocale,
  });

  let mappings = await db
    .select()
    .from(schema.iterableTemplateSyncStates)
    .where(
      and(
        eq(schema.iterableTemplateSyncStates.organizationId, input.organizationId),
        eq(schema.iterableTemplateSyncStates.automationId, input.automation.id),
        inArray(schema.iterableTemplateSyncStates.status, ["active", "push_failed"]),
      ),
    );

  if (input.sourcePaths?.length) {
    const selected = new Set(input.sourcePaths);
    mappings = mappings.filter((row) => selected.has(row.sourcePath));
  }

  const policy = isIterableExistingTranslationPolicy(config.existingTranslationPolicy)
    ? config.existingTranslationPolicy
    : DEFAULT_ITERABLE_EXISTING_TRANSLATION_POLICY;

  const result: PushIterableTemplatesResult = {
    pushedLocales: 0,
    skippedLocales: 0,
    failedLocales: 0,
    itemsProcessed: mappings.length,
  };

  const translationService = new ProjectTranslationService();
  const client = loaded.value.client;

  for (const mapping of mappings) {
    const sourceHtml = await loadSourceContent({
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
    });
    if (!sourceHtml) {
      result.failedLocales += localeMapping.jobTargetLocales.length;
      continue;
    }

    for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
      const projectLocale = localeMapping.jobTargetLocales[index];
      const suffix = localeMapping.iterableSuffixes[index];
      if (!projectLocale || !suffix) {
        continue;
      }
      try {
        const approved = await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: projectLocale,
          approvedTranslationsOnly: true,
          readyTranslationsOnly: true,
        });
        if (approved.translatedKeyCount === 0) {
          result.skippedLocales += 1;
          continue;
        }

        const contentHash = hashIterableContent(
          applyApprovedIterableHtmlTranslations(sourceHtml, approved.prefilled),
        );
        const lastHash = (mapping.lastPushContentHash ?? {})[suffix];
        const remoteEmpty = await isIterableRemoteLocaleEmpty(client, mapping, suffix);
        const action = decideIterablePushLocaleAction({
          policy,
          remoteEmpty,
          lastPushHash: lastHash,
          contentHash,
        });
        if (action === "skip") {
          result.skippedLocales += 1;
          continue;
        }

        if (mapping.resourceKind === "snippet") {
          await pushSnippetLocale({
            client,
            mapping,
            projectLocale,
            suffix,
            sourceHtml,
            approved: approved.prefilled,
          });
        } else if (mapping.resourceKind === "email") {
          await pushEmailLocale({
            client,
            mapping,
            suffix,
            sourceHtml,
            approved: approved.prefilled,
          });
        } else if (mapping.resourceKind === "in_app") {
          await pushInAppLocale({
            client,
            mapping,
            suffix,
            sourceHtml,
            approved: approved.prefilled,
          });
        } else if (mapping.resourceKind === "push") {
          await pushPushLocale({
            client,
            mapping,
            suffix,
            sourceHtml,
            approved: approved.prefilled,
          });
        } else {
          await pushSmsLocale({
            client,
            mapping,
            suffix,
            sourceHtml,
            approved: approved.prefilled,
          });
        }

        await db
          .update(schema.iterableTemplateSyncStates)
          .set({
            lastPushContentHash: { ...mapping.lastPushContentHash, [suffix]: contentHash },
            lastPushedAt: new Date(),
            status: "active",
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.iterableTemplateSyncStates.id, mapping.id));
        mapping.lastPushContentHash = {
          ...mapping.lastPushContentHash,
          [suffix]: contentHash,
        };
        result.pushedLocales += 1;
      } catch (error) {
        logger.warn(
          {
            sourceId: mapping.sourceId,
            suffix,
            error: error instanceof Error ? error.message : String(error),
          },
          "iterable push locale failed",
        );
        result.failedLocales += 1;
        await db
          .update(schema.iterableTemplateSyncStates)
          .set({
            status: "push_failed",
            lastError: { message: error instanceof Error ? error.message : "push_failed" },
            updatedAt: new Date(),
          })
          .where(eq(schema.iterableTemplateSyncStates.id, mapping.id));
      }
    }
  }

  return result;
}

async function loadSourceContent(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<string | null> {
  const latest = await getLatestRepositorySourceFileVersion(input);
  if (!latest) {
    return null;
  }
  const stored = await getStoredFileContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: latest.storedFileId,
  });
  return stored.content.toString("utf8");
}

async function isIterableRemoteLocaleEmpty(
  client: IterableClient,
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect,
  suffix: string,
): Promise<boolean> {
  const templateId = Number(mapping.sourceId);
  try {
    if (mapping.resourceKind === "email") {
      const remote = await client.getEmailTemplate(templateId, suffix);
      return isRemoteContentEmpty(remote);
    }
    if (mapping.resourceKind === "in_app") {
      const remote = await client.getInAppTemplate(templateId, suffix);
      return isRemoteContentEmpty(remote);
    }
    if (mapping.resourceKind === "push") {
      const remote = await client.getPushTemplate(templateId, suffix);
      return isRemoteContentEmpty(remote);
    }
    if (mapping.resourceKind === "sms") {
      const remote = await client.getSmsTemplate(templateId, suffix);
      return isRemoteContentEmpty(remote);
    }
  } catch (error) {
    if (isRemoteLocaleEmpty(error)) {
      return true;
    }
    throw error;
  }
  return true;
}

async function resolveEmailPushTemplateId(
  client: IterableClient,
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect,
  fields: ReturnType<typeof parseIterableEmailEnvelope>,
): Promise<number> {
  if (isIterableInPlaceHtmlEditor(mapping.editorKind)) {
    return Number(mapping.sourceId);
  }
  if (mapping.cloneTemplateId) {
    return Number(mapping.cloneTemplateId);
  }
  const clientTemplateId = `${ITERABLE_EMAIL_CLIENT_TEMPLATE_PREFIX}${mapping.sourceId}`;
  const existing = await client.getByClientTemplateId(clientTemplateId);
  if (existing?.templateId) {
    return existing.templateId;
  }
  const cloneName = `HL ${mapping.sourceName} (localized)`;
  await client.upsertEmailTemplate({
    name: cloneName,
    html: fields.html,
    subject: fields.subject,
    preheaderText: fields.preheaderText,
    plainText: fields.plainText,
    clientTemplateId,
  });
  const created = await client.getByClientTemplateId(clientTemplateId);
  if (!created?.templateId) {
    throw new Error("iterable_clone_template_missing");
  }
  await db
    .update(schema.iterableTemplateSyncStates)
    .set({ cloneTemplateId: String(created.templateId), updatedAt: new Date() })
    .where(eq(schema.iterableTemplateSyncStates.id, mapping.id));
  mapping.cloneTemplateId = String(created.templateId);
  return created.templateId;
}

async function pushEmailLocale(input: {
  client: IterableClient;
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect;
  suffix: string;
  sourceHtml: string;
  approved: Record<string, string>;
}) {
  const translatedHtml = applyApprovedIterableHtmlTranslations(input.sourceHtml, input.approved);
  const parsed = restoreIterableEmailEnvelope(
    parseIterableEmailEnvelope(translatedHtml),
    input.mapping.handlebarsTokens ?? {},
  );
  const templateId = await resolveEmailPushTemplateId(input.client, input.mapping, parsed);
  const remote = await input.client.getEmailTemplate(templateId, input.suffix);
  await input.client.updateEmailTemplate({
    templateId,
    locale: input.suffix,
    subject: parsed.subject,
    preheaderText: parsed.preheaderText,
    html: parsed.html,
    plainText: parsed.plainText,
    fromName: remote.fromName,
  });
}

async function resolveInAppPushTemplateId(
  client: IterableClient,
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect,
  html: string,
): Promise<number> {
  if (isIterableInPlaceHtmlEditor(mapping.editorKind)) {
    return Number(mapping.sourceId);
  }
  if (mapping.cloneTemplateId) {
    return Number(mapping.cloneTemplateId);
  }
  const clientTemplateId = `${ITERABLE_INAPP_CLIENT_TEMPLATE_PREFIX}${mapping.sourceId}`;
  const cloneName = `HL ${mapping.sourceName} (localized in-app)`;
  await client.upsertInAppTemplate({
    name: cloneName,
    html,
    clientTemplateId,
  });
  const templates = await client.listAllTemplates("InApp");
  const match = templates.find((item) => item.name === cloneName);
  if (!match) {
    throw new Error("iterable_inapp_clone_template_missing");
  }
  await db
    .update(schema.iterableTemplateSyncStates)
    .set({ cloneTemplateId: String(match.templateId), updatedAt: new Date() })
    .where(eq(schema.iterableTemplateSyncStates.id, mapping.id));
  mapping.cloneTemplateId = String(match.templateId);
  return match.templateId;
}

async function pushInAppLocale(input: {
  client: IterableClient;
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect;
  suffix: string;
  sourceHtml: string;
  approved: Record<string, string>;
}) {
  const translatedHtml = applyApprovedIterableHtmlTranslations(input.sourceHtml, input.approved);
  const parsed = restoreIterableInAppEnvelope(
    parseIterableInAppEnvelope(translatedHtml),
    input.mapping.handlebarsTokens ?? {},
  );
  const templateId = await resolveInAppPushTemplateId(input.client, input.mapping, parsed.html);
  await input.client.updateInAppTemplate({
    templateId,
    locale: input.suffix,
    html: parsed.html,
  });
}

async function pushPushLocale(input: {
  client: IterableClient;
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect;
  suffix: string;
  sourceHtml: string;
  approved: Record<string, string>;
}) {
  const translated = applyApprovedIterableHtmlTranslations(input.sourceHtml, input.approved);
  const fields = parseIterablePushEnvelope(translated);
  await input.client.updatePushTemplate({
    templateId: Number(input.mapping.sourceId),
    locale: input.suffix,
    title: fields.title,
    message: fields.message,
  });
}

async function pushSmsLocale(input: {
  client: IterableClient;
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect;
  suffix: string;
  sourceHtml: string;
  approved: Record<string, string>;
}) {
  const translated = applyApprovedIterableHtmlTranslations(input.sourceHtml, input.approved);
  const fields = parseIterableSmsEnvelope(translated);
  await input.client.updateSmsTemplate({
    templateId: Number(input.mapping.sourceId),
    locale: input.suffix,
    message: fields.message,
  });
}

async function pushSnippetLocale(input: {
  client: IterableClient;
  mapping: typeof schema.iterableTemplateSyncStates.$inferSelect;
  projectLocale: string;
  suffix: string;
  sourceHtml: string;
  approved: Record<string, string>;
}) {
  const translatedHtml = applyApprovedIterableHtmlTranslations(input.sourceHtml, input.approved);
  const content = restoreIterableSnippetContent(
    parseIterableSnippetHtml(translatedHtml),
    input.mapping.handlebarsTokens?.content,
  );
  const sourceSnippet = await input.client.getSnippet(input.mapping.sourceId);
  const copyName = iterableSnippetLocaleCopyName(input.mapping.sourceName, input.projectLocale);
  await input.client.putSnippet(copyName, {
    content,
    variables: sourceSnippet.variables ?? [],
  });
}
