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
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";
import {
  importApprovedProjectTranslationsFromEntries,
  ProjectTranslationService,
} from "@/lib/projects/translations/project-translation-service";

import { IterableApiError, type IterableClient } from "./client";
import { ITERABLE_IMPORT_CONCURRENCY, type IterableMessageMedium } from "./constants";
import { loadIterableAutomationClient } from "./credentials";
import { classifyIterableHtmlEditor } from "./editor";
import {
  DEFAULT_ITERABLE_EXISTING_TRANSLATION_POLICY,
  decideIterableExistingTranslationAction,
  isIterableExistingTranslationPolicy,
  iterableTranslationPresence,
} from "./existing-translation-policy";
import {
  hashIterableContent,
  seedEntriesForIterableHtml,
  serializeIterableEmailEnvelope,
  serializeIterableInAppEnvelope,
  serializeIterablePushEnvelope,
  serializeIterableSmsEnvelope,
  serializeIterableSnippetHtml,
} from "./html-envelope";
import { mapProjectLocalesToIterable } from "./locale";
import {
  buildIterableEmailSourcePath,
  buildIterableInAppSourcePath,
  buildIterablePushSourcePath,
  buildIterableSmsSourcePath,
  buildIterableSnippetSourcePath,
  isIterableLocaleSuffixSnippetName,
} from "./source-path";

const logger = createLogger("import-iterable-templates");

async function uploadIterableSourceFile(input: {
  organizationId: string;
  project: typeof schema.projects.$inferSelect;
  sourcePath: string;
  content: string;
  sourceLocale: string;
  hash: string;
  filename: string;
  contentType: string;
}) {
  const uploaded = await uploadSourceFile({
    organizationId: input.organizationId,
    project: input.project,
    sourcePath: input.sourcePath,
    sourceHash: input.hash,
    sourceLocale: input.sourceLocale,
    uploadSurface: "iterable_automation",
    file: {
      filename: input.filename,
      contentType: input.contentType,
      content: new TextEncoder().encode(input.content),
    },
  });
  if (!uploaded.ok || uploaded.value.destination !== "native") {
    throw new Error("iterable_source_upload_failed");
  }
  await waitForSourceFileVersionIngest({
    organizationId: input.organizationId,
    sourceFileVersionId: uploaded.value.file.sourceFileVersionId,
  });
}

export type ImportIterableTemplatesResult = {
  imported: number;
  skipped: number;
  failed: number;
  translationsImported: number;
  translationsSkipped: number;
  unmappedProjectTargets: string[];
  warnings: string[];
};

function selectedIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

function shouldImportAll(ids: readonly string[]): boolean {
  return selectedIds(ids).length === 0;
}

function isRemoteLocaleEmpty(error: unknown): boolean {
  return error instanceof IterableApiError && error.status === 404;
}

function noteRejectedIterableLocale(input: {
  result: ImportIterableTemplatesResult;
  templateId: number;
  suffix: string;
  error: unknown;
}): boolean {
  if (!(input.error instanceof IterableApiError) || input.error.status !== 400) {
    return false;
  }
  input.result.warnings.push(
    `Iterable rejected locale ${input.suffix} for template ${input.templateId}. Check the locale code in Iterable.`,
  );
  return true;
}

function readIterableInAppCopy(remote: {
  html: string;
  title?: string;
  subtitle?: string;
  icon?: string;
  inboxMetadata?: { title?: string; subtitle?: string; icon?: string };
}) {
  return {
    html: remote.html,
    title: remote.title ?? remote.inboxMetadata?.title,
    subtitle: remote.subtitle ?? remote.inboxMetadata?.subtitle,
    icon: remote.icon ?? remote.inboxMetadata?.icon,
  };
}

function isRemoteLocaleContentEmpty(payload: {
  html?: string;
  message?: string;
  title?: string;
  subtitle?: string;
  icon?: string;
  inboxMetadata?: { title?: string; subtitle?: string; icon?: string };
}) {
  const parts = [
    payload.html,
    payload.message,
    payload.title,
    payload.subtitle,
    payload.icon,
    payload.inboxMetadata?.title,
    payload.inboxMetadata?.subtitle,
    payload.inboxMetadata?.icon,
  ];
  return parts.every((part) => !part?.trim());
}

async function upsertSyncRow(input: {
  organizationId: string;
  automationId: string;
  projectId: string;
  resourceKind: "email" | "in_app" | "push" | "sms" | "snippet";
  sourceId: string;
  sourceName: string;
  sourcePath: string;
  sourceLocale: string;
  sourceContentHash: string;
  editorKind: "wysiwyg" | "side_by_side" | "drag_and_drop";
  handlebarsTokens: Record<string, string[]>;
  importedTranslationHashes?: Record<string, string>;
  cloneTemplateId?: string | null;
}) {
  await db
    .insert(schema.iterableTemplateSyncStates)
    .values({
      organizationId: input.organizationId,
      automationId: input.automationId,
      projectId: input.projectId,
      resourceKind: input.resourceKind,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      sourcePath: input.sourcePath,
      sourceLocale: input.sourceLocale,
      sourceContentHash: input.sourceContentHash,
      editorKind: input.editorKind,
      handlebarsTokens: input.handlebarsTokens,
      importedTranslationHashes: input.importedTranslationHashes ?? {},
      cloneTemplateId: input.cloneTemplateId ?? null,
      status: "active",
      lastImportedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.iterableTemplateSyncStates.organizationId,
        schema.iterableTemplateSyncStates.automationId,
        schema.iterableTemplateSyncStates.resourceKind,
        schema.iterableTemplateSyncStates.sourceId,
      ],
      set: {
        sourceName: input.sourceName,
        sourcePath: input.sourcePath,
        sourceContentHash: input.sourceContentHash,
        editorKind: input.editorKind,
        handlebarsTokens: input.handlebarsTokens,
        importedTranslationHashes: input.importedTranslationHashes ?? {},
        cloneTemplateId: input.cloneTemplateId ?? null,
        status: "active",
        lastImportedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

async function importLocaleSeeds(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToIterable>;
  policy: string;
  loadRemoteHash: (
    suffix: string,
  ) => Promise<{ hash: string; entries: ReturnType<typeof seedEntriesForIterableHtml> } | null>;
  existingHashes: Record<string, string>;
}) {
  const translationService = new ProjectTranslationService();
  let imported = 0;
  let skipped = 0;
  const importedHashes = { ...input.existingHashes };
  const policy = isIterableExistingTranslationPolicy(input.policy)
    ? input.policy
    : DEFAULT_ITERABLE_EXISTING_TRANSLATION_POLICY;

  for (let index = 0; index < input.localeMapping.jobTargetLocales.length; index += 1) {
    const projectLocale = input.localeMapping.jobTargetLocales[index];
    const suffix = input.localeMapping.iterableSuffixes[index];
    if (!projectLocale || !suffix) {
      continue;
    }
    const remote = await input.loadRemoteHash(suffix);
    if (!remote) {
      continue;
    }
    const presence = iterableTranslationPresence({
      importedHash: importedHashes[suffix],
      translatedKeyCount: (
        await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId: input.projectId,
          sourcePath: input.sourcePath,
          targetLocale: projectLocale,
          approvedTranslationsOnly: false,
          readyTranslationsOnly: false,
        })
      ).translatedKeyCount,
      provenances: ["import"],
    });
    const action = decideIterableExistingTranslationAction({
      policy,
      presence,
      incomingHash: remote.hash,
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
      entries: remote.entries,
    });
    imported += 1;
    importedHashes[suffix] = remote.hash;
  }

  return { imported, skipped, importedHashes };
}

export async function runImportIterableTemplates(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<ImportIterableTemplatesResult> {
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
  if (!localeMapping.sourceSuffix) {
    throw new Error("iterable_source_locale_unmapped");
  }

  const result: ImportIterableTemplatesResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    translationsImported: 0,
    translationsSkipped: 0,
    unmappedProjectTargets: localeMapping.unmappedProjectTargets,
    warnings: [],
  };

  const client = loaded.value.client;
  const policy = config.existingTranslationPolicy ?? DEFAULT_ITERABLE_EXISTING_TRANSLATION_POLICY;
  const projectRow = project;
  const templateFilter = selectedIds(config.templateIds ?? []);
  const snippetFilter = selectedIds(config.snippetIds ?? []);
  const importAllTemplates = shouldImportAll(templateFilter);
  const importAllSnippets = shouldImportAll(snippetFilter);

  const mediums: IterableMessageMedium[] = ["Email", "InApp", "Push", "SMS"];
  const templateItems = (
    await Promise.all(mediums.map((medium) => client.listAllTemplates(medium)))
  ).flat();

  const selectedTemplates = importAllTemplates
    ? templateItems
    : templateItems.filter((item) => templateFilter.includes(String(item.templateId)));

  await mapWithConcurrency(selectedTemplates, ITERABLE_IMPORT_CONCURRENCY, async (item) => {
    const medium = (item.messageMedium ?? "Email") as IterableMessageMedium;
    try {
      if (medium === "Email") {
        await importEmailTemplate({
          client,
          project: projectRow,
          organizationId: input.organizationId,
          automation: input.automation,
          projectId,
          templateId: item.templateId,
          name: item.name,
          sourceLocale: localeMapping.sourceSuffix!,
          localeMapping,
          policy,
          result,
        });
      } else if (medium === "InApp") {
        await importInAppTemplate({
          client,
          project: projectRow,
          organizationId: input.organizationId,
          automation: input.automation,
          projectId,
          templateId: item.templateId,
          name: item.name,
          sourceLocale: localeMapping.sourceSuffix!,
          localeMapping,
          policy,
          result,
        });
      } else if (medium === "Push") {
        await importPushTemplate({
          client,
          project: projectRow,
          organizationId: input.organizationId,
          automation: input.automation,
          projectId,
          templateId: item.templateId,
          name: item.name,
          sourceLocale: localeMapping.sourceSuffix!,
          localeMapping,
          policy,
          result,
        });
      } else {
        await importSmsTemplate({
          client,
          project: projectRow,
          organizationId: input.organizationId,
          automation: input.automation,
          projectId,
          templateId: item.templateId,
          name: item.name,
          sourceLocale: localeMapping.sourceSuffix!,
          localeMapping,
          policy,
          result,
        });
      }
    } catch (error) {
      logger.warn(
        {
          templateId: item.templateId,
          error: error instanceof Error ? error.message : String(error),
        },
        "iterable template import failed",
      );
      result.failed += 1;
    }
  });

  const snippets = await client.listSnippets();
  const suffixesForSkip = [localeMapping.sourceSuffix!, ...localeMapping.iterableSuffixes];
  const selectedSnippets = (
    importAllSnippets
      ? snippets
      : snippets.filter(
          (s) => snippetFilter.includes(s.name) || snippetFilter.includes(String(s.id ?? "")),
        )
  ).filter((snippet) => !isIterableLocaleSuffixSnippetName(snippet.name, suffixesForSkip));

  await mapWithConcurrency(selectedSnippets, ITERABLE_IMPORT_CONCURRENCY, async (snippet) => {
    try {
      await importSnippet({
        client,
        project: projectRow,
        organizationId: input.organizationId,
        automation: input.automation,
        projectId,
        identifier: snippet.name,
        sourceLocale: localeMapping.sourceSuffix!,
        localeMapping,
        policy,
        result,
      });
    } catch (error) {
      logger.warn(
        { snippet: snippet.name, error: error instanceof Error ? error.message : String(error) },
        "iterable snippet import failed",
      );
      result.failed += 1;
    }
  });

  return result;
}

async function importEmailTemplate(input: {
  client: IterableClient;
  project: typeof schema.projects.$inferSelect;
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  templateId: number;
  name: string;
  sourceLocale: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToIterable>;
  policy: string;
  result: ImportIterableTemplatesResult;
}) {
  const remote = await input.client.getEmailTemplate(input.templateId);
  if (!remote) {
    input.result.skipped += 1;
    return;
  }
  const editorKind = classifyIterableHtmlEditor(remote);
  const serialized = serializeIterableEmailEnvelope({
    subject: remote.subject ?? "",
    preheaderText: remote.preheaderText,
    html: remote.html ?? "",
    plainText: remote.plainText,
  });
  const sourcePath = buildIterableEmailSourcePath({
    templateId: input.templateId,
    name: remote.name || input.name,
  });
  const hash = hashIterableContent(serialized.html);
  await uploadIterableSourceFile({
    organizationId: input.organizationId,
    project: input.project,
    sourcePath,
    content: serialized.html,
    sourceLocale: input.sourceLocale,
    hash,
    filename: `${input.templateId}.html`,
    contentType: "text/html",
  });
  const seeds = await importLocaleSeeds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
    localeMapping: input.localeMapping,
    policy: input.policy,
    existingHashes: {},
    loadRemoteHash: async (suffix) => {
      try {
        const localeRemote = await input.client.getEmailTemplate(input.templateId, suffix);
        if (!localeRemote || isRemoteLocaleContentEmpty(localeRemote)) {
          return null;
        }
        const localeSerialized = serializeIterableEmailEnvelope({
          subject: localeRemote.subject ?? "",
          preheaderText: localeRemote.preheaderText,
          html: localeRemote.html ?? "",
          plainText: localeRemote.plainText,
        });
        return {
          hash: hashIterableContent(localeSerialized.html),
          entries: seedEntriesForIterableHtml(sourcePath, localeSerialized.html),
        };
      } catch (error) {
        if (
          isRemoteLocaleEmpty(error) ||
          noteRejectedIterableLocale({
            result: input.result,
            templateId: input.templateId,
            suffix,
            error,
          })
        ) {
          return null;
        }
        throw error;
      }
    },
  });
  await upsertSyncRow({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    projectId: input.projectId,
    resourceKind: "email",
    sourceId: String(input.templateId),
    sourceName: remote.name || input.name,
    sourcePath,
    sourceLocale: input.sourceLocale,
    sourceContentHash: hash,
    editorKind,
    handlebarsTokens: serialized.tokensByField as Record<string, string[]>,
    importedTranslationHashes: seeds.importedHashes,
  });
  input.result.imported += 1;
  input.result.translationsImported += seeds.imported;
  input.result.translationsSkipped += seeds.skipped;
}

async function importInAppTemplate(input: {
  client: IterableClient;
  project: typeof schema.projects.$inferSelect;
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  templateId: number;
  name: string;
  sourceLocale: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToIterable>;
  policy: string;
  result: ImportIterableTemplatesResult;
}) {
  const remote = await input.client.getInAppTemplate(input.templateId);
  if (!remote) {
    input.result.skipped += 1;
    return;
  }
  const editorKind = classifyIterableHtmlEditor(remote);
  const serialized = serializeIterableInAppEnvelope(readIterableInAppCopy(remote));
  const sourcePath = buildIterableInAppSourcePath({
    templateId: input.templateId,
    name: remote.name || input.name,
  });
  const hash = hashIterableContent(serialized.html);
  await uploadIterableSourceFile({
    organizationId: input.organizationId,
    project: input.project,
    sourcePath,
    content: serialized.html,
    sourceLocale: input.sourceLocale,
    hash,
    filename: `${input.templateId}.html`,
    contentType: "text/html",
  });
  const seeds = await importLocaleSeeds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
    localeMapping: input.localeMapping,
    policy: input.policy,
    existingHashes: {},
    loadRemoteHash: async (suffix) => {
      try {
        const localeRemote = await input.client.getInAppTemplate(input.templateId, suffix);
        if (!localeRemote || isRemoteLocaleContentEmpty(localeRemote)) {
          return null;
        }
        const localeSerialized = serializeIterableInAppEnvelope(
          readIterableInAppCopy(localeRemote),
        );
        return {
          hash: hashIterableContent(localeSerialized.html),
          entries: seedEntriesForIterableHtml(sourcePath, localeSerialized.html),
        };
      } catch (error) {
        if (
          isRemoteLocaleEmpty(error) ||
          noteRejectedIterableLocale({
            result: input.result,
            templateId: input.templateId,
            suffix,
            error,
          })
        ) {
          return null;
        }
        throw error;
      }
    },
  });
  await upsertSyncRow({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    projectId: input.projectId,
    resourceKind: "in_app",
    sourceId: String(input.templateId),
    sourceName: remote.name || input.name,
    sourcePath,
    sourceLocale: input.sourceLocale,
    sourceContentHash: hash,
    editorKind,
    handlebarsTokens: serialized.tokensByField as Record<string, string[]>,
    importedTranslationHashes: seeds.importedHashes,
  });
  input.result.imported += 1;
  input.result.translationsImported += seeds.imported;
  input.result.translationsSkipped += seeds.skipped;
}

async function importPushTemplate(input: {
  client: IterableClient;
  project: typeof schema.projects.$inferSelect;
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  templateId: number;
  name: string;
  sourceLocale: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToIterable>;
  policy: string;
  result: ImportIterableTemplatesResult;
}) {
  const remote = await input.client.getPushTemplate(input.templateId);
  if (!remote) {
    input.result.skipped += 1;
    return;
  }
  const json = serializeIterablePushEnvelope({
    title: remote.title ?? "",
    message: remote.message ?? "",
  });
  const sourcePath = buildIterablePushSourcePath({
    templateId: input.templateId,
    name: remote.name || input.name,
  });
  const hash = hashIterableContent(json);
  await uploadIterableSourceFile({
    organizationId: input.organizationId,
    project: input.project,
    sourcePath,
    content: json,
    sourceLocale: input.sourceLocale,
    hash,
    filename: `${input.templateId}.json`,
    contentType: "application/json",
  });
  await upsertSyncRow({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    projectId: input.projectId,
    resourceKind: "push",
    sourceId: String(input.templateId),
    sourceName: remote.name || input.name,
    sourcePath,
    sourceLocale: input.sourceLocale,
    sourceContentHash: hash,
    editorKind: "wysiwyg",
    handlebarsTokens: {},
  });
  input.result.imported += 1;
}

async function importSmsTemplate(input: {
  client: IterableClient;
  project: typeof schema.projects.$inferSelect;
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  templateId: number;
  name: string;
  sourceLocale: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToIterable>;
  policy: string;
  result: ImportIterableTemplatesResult;
}) {
  const remote = await input.client.getSmsTemplate(input.templateId);
  if (!remote) {
    input.result.skipped += 1;
    return;
  }
  const json = serializeIterableSmsEnvelope({ message: remote.message ?? "" });
  const sourcePath = buildIterableSmsSourcePath({
    templateId: input.templateId,
    name: remote.name || input.name,
  });
  const hash = hashIterableContent(json);
  await uploadIterableSourceFile({
    organizationId: input.organizationId,
    project: input.project,
    sourcePath,
    content: json,
    sourceLocale: input.sourceLocale,
    hash,
    filename: `${input.templateId}.json`,
    contentType: "application/json",
  });
  await upsertSyncRow({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    projectId: input.projectId,
    resourceKind: "sms",
    sourceId: String(input.templateId),
    sourceName: remote.name || input.name,
    sourcePath,
    sourceLocale: input.sourceLocale,
    sourceContentHash: hash,
    editorKind: "wysiwyg",
    handlebarsTokens: {},
  });
  input.result.imported += 1;
}

async function importSnippet(input: {
  client: IterableClient;
  project: typeof schema.projects.$inferSelect;
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  projectId: string;
  identifier: string;
  sourceLocale: string;
  localeMapping: ReturnType<typeof mapProjectLocalesToIterable>;
  policy: string;
  result: ImportIterableTemplatesResult;
}) {
  const remote = await input.client.getSnippet(input.identifier);
  const serialized = serializeIterableSnippetHtml(remote.content ?? "");
  const sourcePath = buildIterableSnippetSourcePath({ name: remote.name || input.identifier });
  const hash = hashIterableContent(serialized.html);
  await uploadIterableSourceFile({
    organizationId: input.organizationId,
    project: input.project,
    sourcePath,
    content: serialized.html,
    sourceLocale: input.sourceLocale,
    hash,
    filename: `${remote.name || input.identifier}.html`,
    contentType: "text/html",
  });
  await upsertSyncRow({
    organizationId: input.organizationId,
    automationId: input.automation.id,
    projectId: input.projectId,
    resourceKind: "snippet",
    sourceId: remote.name || input.identifier,
    sourceName: remote.name || input.identifier,
    sourcePath,
    sourceLocale: input.sourceLocale,
    sourceContentHash: hash,
    editorKind: "wysiwyg",
    handlebarsTokens: serialized.tokensByField as Record<string, string[]>,
  });
  input.result.imported += 1;
}
