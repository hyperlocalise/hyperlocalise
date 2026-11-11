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

import {
  getLatestRepositorySourceFileVersion,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { applyApprovedHubspotHtmlTranslations } from "./apply-approved-translations";
import type { HubspotBlogRecord, HubspotContentClient } from "./client";
import {
  buildBlogPostHtmlDocument,
  buildHubspotBlogPostSourcePath,
  readBlogPostHtmlDocument,
} from "./blog-post-files";
import { applyBlogContentDocument, type HubspotStringTree } from "./document";
import { hashHubspotContent } from "./document-hash";
import { parseHubspotBlogFolderPath } from "./source-path";

export function isHubspotBlogBundleSourcePath(sourcePath: string): boolean {
  return parseHubspotBlogFolderPath(sourcePath) != null;
}

export async function loadHubspotBlogPostHtml(input: {
  organizationId: string;
  projectId: string;
  postId: string;
}): Promise<string | null> {
  const sourcePath = buildHubspotBlogPostSourcePath(input.postId);
  const latest = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath,
  });
  if (!latest?.storedFileId) {
    return null;
  }
  const stored = await getStoredFileContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: latest.storedFileId,
  });
  return stored.content.toString("utf8");
}

export function hashHubspotBlogPostHtml(html: string): string {
  return hashHubspotContent(html);
}

export async function hashRemoteBlogPostHtml(
  client: HubspotContentClient,
  copyId: string,
): Promise<string> {
  const copy = await client.getBlogPost(copyId);
  let stylesCss = "";
  try {
    stylesCss = await client.collectBlogPostStylesCss({
      templatePath: copy.templatePath,
      attachedStylesheets: copy.attachedStylesheets,
    });
  } catch {
    stylesCss = "";
  }
  return hashHubspotContent(buildBlogPostHtmlDocument(copy, stylesCss));
}

/** HubSpot post name uses the translated title, not a `{source} [locale]` label. */
export function blogPostPushName(input: {
  sourceName: string;
  translatedName?: string;
  translatedHtmlTitle?: string;
}): string {
  const sourceName = input.sourceName.trim();
  const translatedName = input.translatedName?.trim() ?? "";
  if (translatedName && translatedName !== sourceName) {
    return translatedName;
  }
  const htmlTitle = input.translatedHtmlTitle?.trim() ?? "";
  if (htmlTitle) {
    return htmlTitle;
  }
  return sourceName || "Content";
}

export function blogDraftFieldsFromPostHtml(input: {
  live: HubspotBlogRecord;
  sourceHtml: string;
  remoteHtml?: string | null;
  prefilled: Record<string, string>;
}): ReturnType<typeof applyBlogContentDocument> {
  const translatedHtml = applyApprovedHubspotHtmlTranslations({
    storedEnvelopeHtml: input.sourceHtml,
    remoteEnvelopeHtml: input.remoteHtml,
    approved: input.prefilled,
  });
  const translated = readBlogPostHtmlDocument(translatedHtml);
  return applyBlogContentDocument(input.live, translated);
}

export function mergeBlogPostHtmlTranslations(
  sourceHtml: string,
  prefilled: Record<string, string>,
  remoteHtml?: string | null,
): HubspotStringTree {
  const translatedHtml = applyApprovedHubspotHtmlTranslations({
    storedEnvelopeHtml: sourceHtml,
    remoteEnvelopeHtml: remoteHtml,
    approved: prefilled,
  });
  return readBlogPostHtmlDocument(translatedHtml);
}

export async function loadHubspotBlogApprovedPrefilled(input: {
  translationService: ProjectTranslationService;
  organizationId: string;
  projectId: string;
  postId: string;
  targetLocale: string;
}) {
  return input.translationService.loadAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: buildHubspotBlogPostSourcePath(input.postId),
    targetLocale: input.targetLocale,
    approvedTranslationsOnly: true,
    readyTranslationsOnly: true,
  });
}

/** @deprecated Use hashRemoteBlogPostHtml */
export const hashRemoteBlogImportBundle = hashRemoteBlogPostHtml;
