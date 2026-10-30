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
import { applyHtmlIngestTranslations } from "@/lib/projects/files/html-ingest-entries";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import type { HubspotContentClient } from "./client";
import type { HubspotResourceKind } from "./constants";
import { loadHubspotAutomationClient } from "./credentials";
import {
  applyEmailDocument,
  applyFormDocument,
  applyPageDocument,
  mergeHubspotTranslations,
  readBlogDocument,
  readHubspotStringTree,
  readMessageTemplateDocument,
} from "./document";
import { readHubspotDocumentJson } from "./import-hubspot-content";
import { formDefinitionForWrite } from "./form-write";
import { assignHubspotLocales, hubspotCopyName, mapProjectLocaleToHubspot } from "./locale";

const logger = createLogger("push-hubspot-content");

export type PushHubspotContentResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  itemsProcessed: number;
  warnings: string[];
};

export function readHubspotPushSourcePaths(
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

function resolvePushLocales(input: {
  automation: WorkspaceAutomationRecord;
  projectTargetLocales: readonly string[];
  sourceLocale: string;
}): string[] {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  const configured =
    createJob?.useProjectTargetLocales === false && createJob?.targetLocales?.length
      ? createJob.targetLocales
      : [...input.projectTargetLocales];
  return configured
    .map((locale) => locale.trim())
    .filter((locale) => locale && locale.toLowerCase() !== input.sourceLocale.toLowerCase());
}

async function loadSourceText(input: {
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

async function rememberCopy(input: {
  id: string;
  locale: string;
  copyId: string;
  localeCopyIds: Record<string, string>;
}): Promise<void> {
  await db
    .update(schema.hubspotContentSyncStates)
    .set({
      localeCopyIds: { ...input.localeCopyIds, [input.locale]: input.copyId },
      lastPushedAt: new Date(),
      status: "active",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.hubspotContentSyncStates.id, input.id));
}

async function markPushFailed(id: string, message: string): Promise<void> {
  await db
    .update(schema.hubspotContentSyncStates)
    .set({
      status: "push_failed",
      lastError: { message },
      updatedAt: new Date(),
    })
    .where(eq(schema.hubspotContentSyncStates.id, id));
}

async function findNamedCopy(input: {
  client: HubspotContentClient;
  kind: HubspotResourceKind;
  copyName: string;
}): Promise<string | null> {
  if (input.kind === "email") {
    const emails = await input.client.listEmails();
    return emails.find((item) => item.name === input.copyName)?.id ?? null;
  }
  if (input.kind === "form") {
    const forms = await input.client.listForms();
    return forms.find((item) => item.name === input.copyName)?.id ?? null;
  }
  if (input.kind === "landing-page") {
    const pages = await input.client.listLandingPages();
    return pages.find((item) => item.name === input.copyName)?.id ?? null;
  }
  if (input.kind === "website-page") {
    const pages = await input.client.listWebsitePages();
    return pages.find((item) => item.name === input.copyName)?.id ?? null;
  }
  if (input.kind === "message-template") {
    const templates = await input.client.listMessageTemplates();
    return templates.find((item) => item.name === input.copyName)?.id ?? null;
  }
  const posts = await input.client.listBlogPosts();
  return posts.find((item) => item.name === input.copyName)?.id ?? null;
}

export async function runPushHubspotContent(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
  client?: HubspotContentClient;
}): Promise<PushHubspotContentResult> {
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
  const locales = resolvePushLocales({
    automation: input.automation,
    projectTargetLocales: project.targetLocales ?? [],
    sourceLocale,
  });

  const filters = [
    eq(schema.hubspotContentSyncStates.organizationId, input.organizationId),
    eq(schema.hubspotContentSyncStates.automationId, input.automation.id),
    inArray(schema.hubspotContentSyncStates.status, ["active", "push_failed"]),
  ];
  if (input.sourcePaths && input.sourcePaths.length > 0) {
    filters.push(inArray(schema.hubspotContentSyncStates.sourcePath, input.sourcePaths));
  }
  const mappings = await db
    .select()
    .from(schema.hubspotContentSyncStates)
    .where(and(...filters));

  const result: PushHubspotContentResult = {
    pushedLocales: 0,
    skippedLocales: 0,
    failedLocales: 0,
    itemsProcessed: mappings.length,
    warnings: [],
  };
  const pushWarning = (message: string) => {
    if (result.warnings.length < 20 && !result.warnings.includes(message)) {
      result.warnings.push(message);
    }
  };
  const translationService = new ProjectTranslationService();
  const assignments = {
    email: assignHubspotLocales(locales, "email"),
    form: assignHubspotLocales(locales, "form"),
    blog: assignHubspotLocales(locales, "blog"),
    "landing-page": assignHubspotLocales(locales, "landing-page"),
    "website-page": assignHubspotLocales(locales, "website-page"),
    "message-template": assignHubspotLocales(locales, "message-template"),
  };

  for (const mapping of mappings) {
    const label = mapping.sourceName || mapping.sourcePath;
    const sourceText = await loadSourceText({
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
    });
    if (!sourceText) {
      result.failedLocales += locales.length;
      pushWarning(`${label}: no imported source file`);
      continue;
    }
    const assignment = assignments[mapping.resourceKind];
    const localeCopyIds = { ...mapping.localeCopyIds };

    for (const { locale, code } of assignment.mapped) {
      try {
        const approved = await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: locale,
          approvedTranslationsOnly: true,
          readyTranslationsOnly: true,
        });
        if (approved.translatedKeyCount === 0 || approved.loadedKeyCount === 0) {
          result.skippedLocales += 1;
          continue;
        }
        const copyName = hubspotCopyName(mapping.sourceName, locale);
        const hubspotCode = mapProjectLocaleToHubspot(locale, mapping.resourceKind) ?? code;
        let copyId: string | null = localeCopyIds[locale] ?? null;
        if (!copyId) {
          copyId = await findNamedCopy({ client, kind: mapping.resourceKind, copyName });
        }
        if (copyId && hubspot.overwriteWhenRemoteNewer === false) {
          result.skippedLocales += 1;
          continue;
        }

        if (mapping.resourceKind === "email") {
          const sourceDocument = readHubspotStringTree(readHubspotDocumentJson(sourceText) ?? {});
          const translated = mergeHubspotTranslations(sourceDocument, approved.prefilled);
          const live = await client.getEmail(mapping.sourceId);
          const applied = applyEmailDocument(live.widgets, translated);
          const targetId =
            copyId ??
            (
              await client.cloneEmail({
                id: mapping.sourceId,
                cloneName: copyName,
              })
            ).id;
          await client.updateEmailDraft({
            id: targetId,
            name: copyName,
            language: hubspotCode,
            subject: applied.subject || live.subject,
            widgets: applied.widgets,
          });
          copyId = targetId;
        } else if (mapping.resourceKind === "form") {
          const sourceDocument = readHubspotStringTree(readHubspotDocumentJson(sourceText) ?? {});
          const translated = mergeHubspotTranslations(sourceDocument, approved.prefilled);
          const live = await client.getForm(mapping.sourceId);
          const applied = applyFormDocument(live.definition, translated);
          const definition = formDefinitionForWrite(applied, {
            name: copyName,
            language: hubspotCode,
            create: !copyId,
          });
          if (copyId) {
            await client.replaceForm(copyId, definition);
          } else {
            copyId = (await client.createForm(definition)).id;
          }
        } else if (mapping.resourceKind === "message-template") {
          const translatedHtml = applyHtmlIngestTranslations(sourceText, approved.prefilled);
          const read = readMessageTemplateDocument(translatedHtml);
          const live = await client.getMessageTemplate(mapping.sourceId);
          const subject = read.foundSubject ? read.subject : live.subject;
          const body = read.foundBody ? read.body : live.body;
          const existingCopyId = copyId && copyId !== mapping.sourceId ? copyId : null;
          if (existingCopyId) {
            await client.updateMessageTemplate({
              id: existingCopyId,
              name: copyName,
              subject,
              body,
            });
            copyId = existingCopyId;
          } else {
            copyId = (
              await client.createMessageTemplate({
                name: copyName,
                subject,
                body,
                folderId: live.folderId,
              })
            ).id;
          }
        } else if (mapping.resourceKind === "blog") {
          const translatedHtml = applyHtmlIngestTranslations(sourceText, approved.prefilled);
          const blog = readBlogDocument(translatedHtml);
          const targetId =
            copyId ??
            (
              await client.createBlogLanguageVariation({
                id: mapping.sourceId,
                language: hubspotCode,
              })
            ).id;
          await client.updateBlogDraft({
            id: targetId,
            name: copyName,
            htmlTitle: blog.htmlTitle,
            metaDescription: blog.metaDescription,
            postBody: blog.postBody,
          });
          copyId = targetId;
        } else {
          const sourceDocument = readHubspotStringTree(readHubspotDocumentJson(sourceText) ?? {});
          const translated = mergeHubspotTranslations(sourceDocument, approved.prefilled);
          const live =
            mapping.resourceKind === "landing-page"
              ? await client.getLandingPage(mapping.sourceId)
              : await client.getWebsitePage(mapping.sourceId);
          const applied = applyPageDocument(live, translated);
          const createVariation =
            mapping.resourceKind === "landing-page"
              ? client.createLandingPageLanguageVariation.bind(client)
              : client.createWebsitePageLanguageVariation.bind(client);
          const updateDraft =
            mapping.resourceKind === "landing-page"
              ? client.updateLandingPageDraft.bind(client)
              : client.updateWebsitePageDraft.bind(client);
          const targetId =
            copyId ??
            (
              await createVariation({
                id: mapping.sourceId,
                language: hubspotCode,
              })
            ).id;
          await updateDraft({
            id: targetId,
            name: copyName,
            language: hubspotCode,
            htmlTitle: applied.htmlTitle,
            metaDescription: applied.metaDescription,
            featuredImageAltText: applied.featuredImageAltText,
            widgets: applied.widgets,
            layoutSections: applied.layoutSections,
            widgetContainers: applied.widgetContainers,
          });
          copyId = targetId;
        }

        localeCopyIds[locale] = copyId;
        await rememberCopy({
          id: mapping.id,
          locale,
          copyId,
          localeCopyIds,
        });
        result.pushedLocales += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "push_failed";
        logger.warn(
          { syncStateId: mapping.id, sourceId: mapping.sourceId, locale, error: String(error) },
          "hubspot push locale failed",
        );
        result.failedLocales += 1;
        pushWarning(`${label} [${locale}]: failed (${message})`);
        await markPushFailed(mapping.id, message);
      }
    }
  }

  return result;
}
