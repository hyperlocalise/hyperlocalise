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
import { isHubspotSupportedResourceKind, type HubspotResourceKind } from "./constants";
import { loadHubspotAutomationClient } from "./credentials";
import {
  applyBlogContentDocument,
  applyEmailDocument,
  applyFormDocument,
  extractEmailStyleSettings,
  hashHubspotContent,
  mergeHubspotTranslations,
  readBlogDocument,
  readEmailHtmlDocument,
  readHubspotStringTree,
  serializeHubspotDocument,
} from "./document";
import { isHubspotRemoteCopyEmpty } from "./remote-copy";
import { isNewEditorForm, newEditorFormPushWarning } from "./form-definition";
import { formDefinitionForWrite } from "./form-write";
import {
  decideHubspotPushLocaleAction,
  DEFAULT_HUBSPOT_EXISTING_TRANSLATION_POLICY,
  isHubspotExistingTranslationPolicy,
  isHubspotRemoteCopyNewer,
} from "./existing-translation-policy";
import { readHubspotDocumentJson } from "./import-hubspot-content";
import {
  blogDraftFieldsFromPostHtml,
  blogPostPushName,
  isHubspotBlogBundleSourcePath,
  loadHubspotBlogApprovedPrefilled,
  loadHubspotBlogPostHtml,
} from "./blog-post-bundle";
import {
  isHubspotPageKind,
  pageDraftFieldsFromHtml,
  type HubspotPageKind,
} from "./page-files";
import { parseHubspotBlogFolderPath } from "./source-path";
import {
  assignHubspotLocales,
  findBlogLanguageVariation,
  HUBSPOT_BLOG_LANGUAGE_HINT,
  hubspotCopyName,
  isMissingBlogLanguageMessage,
  mapProjectLocaleToHubspot,
} from "./locale";

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
  lastPushContentHash: Record<string, string>;
}): Promise<void> {
  await db
    .update(schema.hubspotContentSyncStates)
    .set({
      localeCopyIds: { ...input.localeCopyIds, [input.locale]: input.copyId },
      lastPushContentHash: input.lastPushContentHash,
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
  const posts = await input.client.listBlogPosts();
  return posts.find((item) => item.name === input.copyName)?.id ?? null;
}

/**
 * `updatedAt` of a locale copy for the remote-newer check. Surfaces without a
 * tracked timestamp return null so callers protect the copy.
 */
async function loadCopyUpdatedAt(
  client: HubspotContentClient,
  kind: HubspotResourceKind,
  copyId: string,
): Promise<string | null> {
  try {
    if (kind === "email") {
      return (await client.getEmail(copyId)).updatedAt;
    }
    if (kind === "form") {
      return (await client.getForm(copyId)).updatedAt;
    }
    if (kind === "landing-page") {
      return (await client.getLandingPage(copyId)).updatedAt;
    }
    if (kind === "website-page") {
      return (await client.getWebsitePage(copyId)).updatedAt;
    }
    return (await client.getBlogPost(copyId)).updatedAt;
  } catch {
    return null;
  }
}

async function pushPageLocale(input: {
  client: HubspotContentClient;
  kind: HubspotPageKind;
  sourceId: string;
  copyId: string | null;
  copyName: string;
  language: string;
  sourceHtml: string;
  prefilled: Record<string, string>;
}): Promise<string> {
  const live =
    input.kind === "landing-page"
      ? await input.client.getLandingPage(input.sourceId)
      : await input.client.getWebsitePage(input.sourceId);
  const applied = pageDraftFieldsFromHtml({
    live,
    sourceHtml: input.sourceHtml,
    prefilled: input.prefilled,
  });
  let copyId = input.copyId;
  if (!copyId) {
    copyId =
      input.kind === "landing-page"
        ? (
            await input.client.createLandingPageLanguageVariation({
              id: input.sourceId,
              language: input.language,
            })
          ).id
        : (
            await input.client.createWebsitePageLanguageVariation({
              id: input.sourceId,
              language: input.language,
            })
          ).id;
  }
  const draft = {
    id: copyId,
    name: input.copyName,
    language: input.language,
    htmlTitle: applied.htmlTitle,
    metaDescription: applied.metaDescription,
    featuredImageAltText: applied.featuredImageAltText,
    widgets: applied.widgets,
    layoutSections: applied.layoutSections,
    widgetContainers: applied.widgetContainers,
  };
  if (input.kind === "landing-page") {
    await input.client.updateLandingPageDraft(draft);
  } else {
    await input.client.updateWebsitePageDraft(draft);
  }
  return copyId;
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
  const policy = isHubspotExistingTranslationPolicy(hubspot.existingTranslationPolicy)
    ? hubspot.existingTranslationPolicy
    : DEFAULT_HUBSPOT_EXISTING_TRANSLATION_POLICY;
  const warnedNewEditorForms = new Set<string>();
  for (const mapping of mappings) {
    if (!isHubspotSupportedResourceKind(mapping.resourceKind)) {
      continue;
    }
    const assignment = assignHubspotLocales(locales, mapping.resourceKind);
    for (const locale of assignment.unmapped) {
      pushWarning(`${mapping.resourceKind}: ${locale} has no HubSpot language code`);
    }
    for (const collision of assignment.collisions) {
      pushWarning(
        `${mapping.resourceKind}: ${collision.locale} uses the same HubSpot code as ${collision.keptLocale} (${collision.code})`,
      );
    }
    const label = mapping.sourceName || mapping.sourcePath;
    const blogPostId =
      mapping.resourceKind === "blog" && isHubspotBlogBundleSourcePath(mapping.sourcePath)
        ? parseHubspotBlogFolderPath(mapping.sourcePath)
        : null;
    const blogPostHtml = blogPostId
      ? await loadHubspotBlogPostHtml({
          organizationId: input.organizationId,
          projectId,
          postId: blogPostId,
        })
      : null;
    const sourceFileContent: string = blogPostId
      ? (blogPostHtml ?? "")
      : ((await loadSourceText({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
        })) ?? "");
    if (blogPostId) {
      if (!blogPostHtml?.trim()) {
        result.failedLocales += locales.length;
        pushWarning(`${label}: no imported blog post.html`);
        continue;
      }
    } else if (!sourceFileContent) {
      result.failedLocales += locales.length;
      pushWarning(`${label}: no imported source file`);
      continue;
    }
    const localeCopyIds = { ...mapping.localeCopyIds };
    const pushHashes = { ...mapping.lastPushContentHash };
    const blogSummaries = mapping.resourceKind === "blog" ? await client.listBlogPosts() : [];
    const pageSummaries =
      mapping.resourceKind === "landing-page"
        ? await client.listLandingPages()
        : mapping.resourceKind === "website-page"
          ? await client.listWebsitePages()
          : [];

    for (const { locale, code } of assignment.mapped) {
      try {
        const approved = blogPostId
          ? await loadHubspotBlogApprovedPrefilled({
              translationService,
              organizationId: input.organizationId,
              projectId,
              postId: blogPostId,
              targetLocale: locale,
            })
          : await translationService.loadAsPrefilledEntries({
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
        const sourceJson = blogPostId ? null : readHubspotDocumentJson(sourceFileContent);
        const translatedContent = sourceJson
          ? serializeHubspotDocument(
              mergeHubspotTranslations(readHubspotStringTree(sourceJson), approved.prefilled),
            )
          : applyHtmlIngestTranslations(sourceFileContent, approved.prefilled);
        const contentHash = hashHubspotContent(translatedContent);
        const copyName = hubspotCopyName(mapping.sourceName, locale);
        const hubspotCode = mapProjectLocaleToHubspot(locale, mapping.resourceKind) ?? code;
        let copyId: string | null = localeCopyIds[locale] ?? null;
        if (!copyId) {
          copyId = await findNamedCopy({ client, kind: mapping.resourceKind, copyName });
        }
        if (!copyId && mapping.resourceKind === "blog") {
          copyId = findBlogLanguageVariation(blogSummaries, mapping.sourceId, hubspotCode);
        }
        if (!copyId && isHubspotPageKind(mapping.resourceKind)) {
          copyId = findBlogLanguageVariation(pageSummaries, mapping.sourceId, hubspotCode);
        }
        if (copyId && hubspot.overwriteWhenRemoteNewer === false) {
          const copyUpdatedAt = await loadCopyUpdatedAt(client, mapping.resourceKind, copyId);
          if (isHubspotRemoteCopyNewer({ lastPushedAt: mapping.lastPushedAt, copyUpdatedAt })) {
            result.skippedLocales += 1;
            continue;
          }
        }
        const remoteEmpty =
          copyId == null
            ? true
            : await isHubspotRemoteCopyEmpty({
                client,
                kind: mapping.resourceKind,
                copyId,
                sourceText: sourceFileContent,
                sourceJson,
                blogPostHtml: blogPostId ? blogPostHtml : undefined,
              });
        const action = decideHubspotPushLocaleAction({
          policy,
          remoteEmpty,
          lastPushHash: pushHashes[locale],
          contentHash,
        });
        if (action === "skip") {
          result.skippedLocales += 1;
          continue;
        }

        if (mapping.resourceKind === "email") {
          const translatedHtml = sourceJson
            ? null
            : applyHtmlIngestTranslations(sourceFileContent, approved.prefilled);
          const translated = sourceJson
            ? mergeHubspotTranslations(readHubspotStringTree(sourceJson), approved.prefilled)
            : readEmailHtmlDocument(translatedHtml ?? sourceFileContent);
          const styleSettings =
            translatedHtml == null ? undefined : extractEmailStyleSettings(translatedHtml);
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
            ...(styleSettings !== undefined ? { styleSettings } : {}),
          });
          copyId = targetId;
        } else if (mapping.resourceKind === "form") {
          if (!sourceJson) {
            throw new Error("hubspot_form_source_missing");
          }
          const live = await client.getForm(mapping.sourceId);
          if (isNewEditorForm(live.definition) && !warnedNewEditorForms.has(mapping.sourceId)) {
            warnedNewEditorForms.add(mapping.sourceId);
            pushWarning(newEditorFormPushWarning(label));
          }
          const applied = applyFormDocument(
            live.definition,
            mergeHubspotTranslations(readHubspotStringTree(sourceJson), approved.prefilled),
          );
          if (!copyId) {
            copyId = (
              await client.createForm(
                formDefinitionForWrite(applied, { name: copyName, language: hubspotCode }),
              )
            ).id;
          } else {
            await client.replaceForm(
              copyId,
              formDefinitionForWrite(applied, {
                name: copyName,
                language: hubspotCode,
                id: copyId,
              }),
            );
          }
        } else if (isHubspotPageKind(mapping.resourceKind)) {
          copyId = await pushPageLocale({
            client,
            kind: mapping.resourceKind,
            sourceId: mapping.sourceId,
            copyId,
            copyName,
            language: hubspotCode,
            sourceHtml: sourceFileContent,
            prefilled: approved.prefilled,
          });
        } else {
          if (!copyId) {
            copyId = (
              await client.createBlogPostLanguageDraft({
                id: mapping.sourceId,
                language: hubspotCode,
                name: copyName,
              })
            ).id;
          }
          if (blogPostId && blogPostHtml) {
            const live = await client.getBlogPost(mapping.sourceId);
            const applied = blogDraftFieldsFromPostHtml({
              live,
              sourceHtml: blogPostHtml,
              prefilled: approved.prefilled,
            });
            await client.updateBlogDraft({
              id: copyId,
              name: blogPostPushName({
                sourceName: mapping.sourceName,
                translatedName: applied.name,
                translatedHtmlTitle: applied.htmlTitle,
              }),
              htmlTitle: applied.htmlTitle,
              metaDescription: applied.metaDescription,
              featuredImageAltText: applied.featuredImageAltText,
              postBody: applied.postBody,
              postSummary: applied.postSummary,
              rssBody: applied.rssBody || undefined,
              rssSummary: applied.rssSummary,
              widgets: applied.widgets,
              layoutSections: applied.layoutSections,
              widgetContainers: applied.widgetContainers,
            });
          } else if (sourceJson) {
            const translated = mergeHubspotTranslations(
              readHubspotStringTree(sourceJson),
              approved.prefilled,
            );
            const live = await client.getBlogPost(mapping.sourceId);
            const applied = applyBlogContentDocument(live, translated);
            await client.updateBlogDraft({
              id: copyId,
              name: blogPostPushName({
                sourceName: mapping.sourceName,
                translatedName: applied.name,
                translatedHtmlTitle: applied.htmlTitle,
              }),
              htmlTitle: applied.htmlTitle,
              metaDescription: applied.metaDescription,
              featuredImageAltText: applied.featuredImageAltText,
              postBody: applied.postBody,
              postSummary: applied.postSummary,
              rssBody: applied.rssBody || undefined,
              rssSummary: applied.rssSummary,
              widgets: applied.widgets,
              layoutSections: applied.layoutSections,
              widgetContainers: applied.widgetContainers,
            });
          } else {
            const translatedHtml = applyHtmlIngestTranslations(
              sourceFileContent,
              approved.prefilled,
            );
            const blog = readBlogDocument(translatedHtml);
            await client.updateBlogDraft({
              id: copyId,
              name: blogPostPushName({
                sourceName: mapping.sourceName,
                translatedHtmlTitle: blog.htmlTitle,
              }),
              htmlTitle: blog.htmlTitle,
              metaDescription: blog.metaDescription,
              postBody: blog.postBody,
            });
          }
        }

        if (!copyId) {
          throw new Error("hubspot_locale_copy_missing");
        }
        localeCopyIds[locale] = copyId;
        pushHashes[locale] = contentHash;
        await rememberCopy({
          id: mapping.id,
          locale,
          copyId,
          localeCopyIds,
          lastPushContentHash: pushHashes,
        });
        result.pushedLocales += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "push_failed";
        if (isMissingBlogLanguageMessage(message)) {
          result.skippedLocales += 1;
          pushWarning(`${label}: skipped ${locale} (${HUBSPOT_BLOG_LANGUAGE_HINT})`);
          continue;
        }
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
