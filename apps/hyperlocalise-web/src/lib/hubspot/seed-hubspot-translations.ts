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
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";
import {
  importApprovedProjectTranslationsFromEntries,
  ProjectTranslationService,
} from "@/lib/projects/translations/project-translation-service";

import type {
  HubspotBlogSummary,
  HubspotContentClient,
  HubspotEmailSummary,
  HubspotFormSummary,
  HubspotPageSummary,
} from "./client";
import type { HubspotResourceKind } from "./constants";
import {
  buildBlogContentDocument,
  buildEmailDocument,
  buildFormDocument,
  buildPageDocument,
  emailHtmlKinds,
  buildEmailHtmlDocument,
  flattenHubspotDocument,
  hashHubspotContent,
  isHubspotJsonObject,
  readEmailHtmlDocument,
  readHubspotStringTree,
  unflattenHubspotDocument,
  type HubspotJson,
} from "./document";
import {
  decideHubspotExistingTranslationAction,
  hubspotTranslationPresence,
  type HubspotExistingTranslationPolicy,
} from "./existing-translation-policy";
import { assignHubspotLocales, hubspotCopyName, normalizeHubspotLocaleTag } from "./locale";

export type HubspotSeedableKind = Exclude<HubspotResourceKind, "message-template">;

export type HubspotSeedDiscoveryCache = {
  emails?: HubspotEmailSummary[];
  forms?: HubspotFormSummary[];
  blogs?: HubspotBlogSummary[];
  landingPages?: HubspotPageSummary[];
  websitePages?: HubspotPageSummary[];
};

function parseStoredJsonObject(content: string): { [key: string]: HubspotJson } | null {
  const parsed = safeJsonParse(content);
  if (!parsed.ok) {
    return null;
  }
  const value: HubspotJson = parsed.value;
  return isHubspotJsonObject(value) ? value : null;
}

/** Source keys a locale must cover before it counts as fully seeded. */
export function hubspotSeedSourceKeys(kind: HubspotSeedableKind, sourceContent: string): string[] {
  if (kind === "email") {
    return Object.keys(extractHtmlIngestEntries(sourceContent));
  }
  const json = parseStoredJsonObject(sourceContent);
  if (!json) {
    return [];
  }
  return Object.keys(flattenHubspotDocument(readHubspotStringTree(json)));
}

/**
 * Keep only locale values that actually translate the source. HubSpot locale
 * copies carry every field, translated or not, so values identical to the
 * source are untranslated and must not seed as approved translations.
 */
export function hubspotDifferingEntries(
  sourceFlat: Record<string, string>,
  localeFlat: Record<string, string>,
): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, sourceValue] of Object.entries(sourceFlat)) {
    const localeValue = localeFlat[key];
    if (localeValue?.trim() && localeValue !== sourceValue) {
      entries[key] = localeValue;
    }
  }
  return entries;
}

export function hubspotSeedHash(entries: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(entries).toSorted()) {
    sorted[key] = entries[key] ?? "";
  }
  return hashHubspotContent(JSON.stringify(sorted));
}

export function isHubspotSeedComplete(
  sourceKeys: readonly string[],
  entries: Record<string, string>,
): boolean {
  if (sourceKeys.length === 0) {
    return false;
  }
  return sourceKeys.every((key) => (entries[key] ?? "").trim().length > 0);
}

function emailSeedEntries(
  sourceContent: string,
  localeFlat: Record<string, string>,
): Record<string, string> {
  const sourceTree = readEmailHtmlDocument(sourceContent);
  const sourceFlat = flattenHubspotDocument(sourceTree);
  const merged: Record<string, string> = {};
  for (const [key, sourceValue] of Object.entries(sourceFlat)) {
    const localeValue = localeFlat[key];
    if (localeValue?.trim() && localeValue !== sourceValue) {
      merged[key] = localeValue;
    }
  }
  if (Object.keys(merged).length === 0) {
    return {};
  }
  const envelope = buildEmailHtmlDocument(unflattenHubspotDocument(merged), {
    kinds: emailHtmlKinds(sourceTree),
  });
  return extractHtmlIngestEntries(envelope);
}

async function listSeedSummaries(
  client: HubspotContentClient,
  kind: HubspotSeedableKind,
  cache: HubspotSeedDiscoveryCache,
): Promise<void> {
  if (kind === "email" && !cache.emails) {
    cache.emails = await client.listEmails();
  } else if (kind === "form" && !cache.forms) {
    cache.forms = await client.listForms();
  } else if (kind === "blog" && !cache.blogs) {
    cache.blogs = await client.listBlogPosts();
  } else if (kind === "landing-page" && !cache.landingPages) {
    cache.landingPages = await client.listLandingPages();
  } else if (kind === "website-page" && !cache.websitePages) {
    cache.websitePages = await client.listWebsitePages();
  }
}

function discoveredCopyId(input: {
  kind: HubspotSeedableKind;
  sourceId: string;
  sourceName: string;
  locale: string;
  code: string;
  cache: HubspotSeedDiscoveryCache;
}): string | null {
  if (input.kind === "email") {
    const name = hubspotCopyName(input.sourceName, input.locale);
    return input.cache.emails?.find((item) => item.name === name)?.id ?? null;
  }
  if (input.kind === "form") {
    const name = hubspotCopyName(input.sourceName, input.locale);
    return input.cache.forms?.find((item) => item.name === name)?.id ?? null;
  }
  if (input.kind === "blog") {
    return (
      input.cache.blogs?.find(
        (item) =>
          item.translatedFromId === input.sourceId &&
          normalizeHubspotLocaleTag(item.language ?? "") === input.code,
      )?.id ?? null
    );
  }
  const pages = input.kind === "landing-page" ? input.cache.landingPages : input.cache.websitePages;
  return (
    pages?.find(
      (item) =>
        item.translatedFromId === input.sourceId &&
        normalizeHubspotLocaleTag(item.language ?? "") === input.code,
    )?.id ?? null
  );
}

async function readRemoteLocaleFlat(input: {
  client: HubspotContentClient;
  kind: HubspotSeedableKind;
  copyId: string;
}): Promise<Record<string, string> | null> {
  if (input.kind === "email") {
    const email = await input.client.getEmail(input.copyId);
    return flattenHubspotDocument(
      buildEmailDocument({ subject: email.subject, widgets: email.widgets }),
    );
  }
  if (input.kind === "form") {
    const form = await input.client.getForm(input.copyId);
    return flattenHubspotDocument(buildFormDocument(form.definition));
  }
  if (input.kind === "blog") {
    const post = await input.client.getBlogPost(input.copyId);
    return flattenHubspotDocument(buildBlogContentDocument(post));
  }
  const page =
    input.kind === "landing-page"
      ? await input.client.getLandingPage(input.copyId)
      : await input.client.getWebsitePage(input.copyId);
  return flattenHubspotDocument(buildPageDocument(page));
}

async function remoteFlatWithFallback(input: {
  client: HubspotContentClient;
  kind: HubspotSeedableKind;
  sourceId: string;
  sourceName: string;
  locale: string;
  code: string;
  storedCopyId?: string | null;
  cache: HubspotSeedDiscoveryCache;
}): Promise<Record<string, string> | null> {
  const candidates: Array<string | null> = [input.storedCopyId?.trim() || null];
  await listSeedSummaries(input.client, input.kind, input.cache);
  candidates.push(
    discoveredCopyId({
      kind: input.kind,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      locale: input.locale,
      code: input.code,
      cache: input.cache,
    }),
  );
  const seen = new Set<string>();
  for (const copyId of candidates) {
    if (!copyId || seen.has(copyId)) {
      continue;
    }
    seen.add(copyId);
    try {
      const flat = await readRemoteLocaleFlat({ client: input.client, kind: input.kind, copyId });
      if (flat && Object.keys(flat).length > 0) {
        return flat;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function loadHubspotLocalePresence(input: {
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
      presence: hubspotTranslationPresence({
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
    presence: hubspotTranslationPresence({
      importedHash: input.importedHash,
      translatedKeyCount: translations.filter((row) => (row.text ?? "").trim().length > 0).length,
      provenances: translations.map((row) => row.provenance),
    }),
  };
}

export type HubspotSeedItemResult = {
  importedHashes: Record<string, string>;
  seededComplete: string[];
  warnings: string[];
};

function pushSeedWarning(warnings: string[], message: string) {
  if (warnings.length < 20 && !warnings.includes(message)) {
    warnings.push(message);
  }
}

/**
 * Seed approved translations from HubSpot locale copies into the project,
 * honoring the existing-translation policy. Returns per-locale imported
 * hashes (for the sync row) and the locales fully covered (skip job creation).
 */
export async function seedHubspotItemLocales(input: {
  client: HubspotContentClient;
  discovery: HubspotSeedDiscoveryCache;
  translationService: ProjectTranslationService;
  organizationId: string;
  projectId: string;
  kind: HubspotSeedableKind;
  sourceId: string;
  sourceName: string;
  sourcePath: string;
  sourceContent: string;
  targetLocales: string[];
  policy: HubspotExistingTranslationPolicy;
  previousHashes: Record<string, string>;
  previousCopyIds: Record<string, string>;
}): Promise<HubspotSeedItemResult> {
  const importedHashes = { ...input.previousHashes };
  const seededComplete: string[] = [];
  const warnings: string[] = [];
  const sourceKeys = hubspotSeedSourceKeys(input.kind, input.sourceContent);
  if (sourceKeys.length === 0) {
    return { importedHashes, seededComplete, warnings };
  }
  const sourceFlat =
    input.kind === "email"
      ? flattenHubspotDocument(readEmailHtmlDocument(input.sourceContent))
      : flattenHubspotDocument(
          readHubspotStringTree(parseStoredJsonObject(input.sourceContent) ?? {}),
        );

  for (const { locale, code } of assignHubspotLocales(input.targetLocales, input.kind).mapped) {
    try {
      const { presence } = await loadHubspotLocalePresence({
        translationService: input.translationService,
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: locale,
        importedHash: importedHashes[locale],
      });
      if (input.policy === "seed_empty" && presence.hasExistingTranslation) {
        continue;
      }
      const localeFlat = await remoteFlatWithFallback({
        client: input.client,
        kind: input.kind,
        sourceId: input.sourceId,
        sourceName: input.sourceName,
        locale,
        code,
        storedCopyId: input.previousCopyIds[locale],
        cache: input.discovery,
      });
      if (!localeFlat) {
        continue;
      }
      let entries: Record<string, string>;
      if (input.kind === "email") {
        entries = emailSeedEntries(input.sourceContent, localeFlat);
      } else {
        entries = hubspotDifferingEntries(sourceFlat, localeFlat);
      }
      if (Object.keys(entries).length === 0) {
        continue;
      }
      const incomingHash = hubspotSeedHash(entries);
      const action = decideHubspotExistingTranslationAction({
        policy: input.policy,
        presence,
        incomingHash,
      });
      if (action === "skip") {
        continue;
      }
      const result = await importApprovedProjectTranslationsFromEntries({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: locale,
        entries,
      });
      if (result.imported > 0 && isHubspotSeedComplete(sourceKeys, entries)) {
        importedHashes[locale] = incomingHash;
        seededComplete.push(locale);
      } else {
        delete importedHashes[locale];
      }
    } catch (error) {
      pushSeedWarning(warnings, `${input.sourceName} [${locale}]: seed failed (${String(error)})`);
    }
  }
  return { importedHashes, seededComplete, warnings };
}
