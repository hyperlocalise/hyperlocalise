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

import { db, schema } from "@/lib/database/client";
import { getLatestRepositorySourceFileVersion } from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { hlEntriesPayloadToStringMap } from "@/lib/projects/files/hl-entries";
import { replaceImageVariantBytes } from "@/lib/projects/files/image-variant-service";
import { importApprovedProjectTranslationsFromEntries } from "@/lib/projects/translations/project-translation-service";
import {
  createTranslationSandbox,
  extractSandboxEntries,
  prepareSandbox,
  stopTranslationSandbox,
  writeFilesToSandbox,
} from "@/lib/translation/sandbox";

import { hashIntercomArticleContent, serializeIntercomArticleMarkdown } from "./article-markdown";
import {
  decideIntercomExistingTranslationAction,
  type IntercomExistingTranslationPolicy,
  type IntercomLocaleTranslationPresence,
} from "./intercom-existing-translation-policy";
import {
  normalizeIntercomLocaleTag,
  selectIntercomTargetLocalesToImport,
  type IntercomLocaleContentFields,
  type IntercomTargetLocaleToImport,
} from "./intercom-locale";
import { loadApprovedIntercomArticleValuesByPath } from "./push-eligibility";

const logger = createLogger("import-intercom-target-translations");

export type ImportIntercomTargetTranslationsResult = {
  importedLocales: string[];
  skippedLocales: string[];
  failedLocales: string[];
  importedTranslationHashes: Record<string, string>;
  pushReadyLocales: string[];
};

export type ExtractIntercomTargetEntries = (
  locales: ReadonlyArray<{ projectLocale: string; markdown: string }>,
) => Promise<Map<string, Record<string, string>>>;

export async function extractIntercomTargetEntriesWithSandbox(
  locales: ReadonlyArray<{ projectLocale: string; markdown: string }>,
): Promise<Map<string, Record<string, string>>> {
  const entriesByLocale = new Map<string, Record<string, string>>();
  if (locales.length === 0) {
    return entriesByLocale;
  }

  const { sandboxId } = await createTranslationSandbox();
  try {
    await prepareSandbox(sandboxId);
    await writeFilesToSandbox(
      sandboxId,
      locales.map((locale) => ({
        path: sandboxFilenameForLocale(locale.projectLocale),
        content: locale.markdown,
      })),
    );

    for (const locale of locales) {
      const extracted = await extractSandboxEntries(
        sandboxId,
        sandboxFilenameForLocale(locale.projectLocale),
        { locale: locale.projectLocale },
      );
      if (!extracted.ok) {
        throw new Error(`intercom_target_entries_extract_failed:${locale.projectLocale}`);
      }
      entriesByLocale.set(locale.projectLocale, hlEntriesPayloadToStringMap(extracted.entries));
    }
  } finally {
    await stopTranslationSandbox(sandboxId).catch(() => undefined);
  }

  return entriesByLocale;
}

function sandboxFilenameForLocale(projectLocale: string): string {
  return `${projectLocale.replace(/[^a-zA-Z0-9._-]/g, "_")}.md`;
}

export function remainingIntercomJobTargetLocales(input: {
  jobTargetLocales: readonly string[];
  importedProjectLocales: readonly string[];
  pushReadyProjectLocales: readonly string[];
  sourceUnchanged?: boolean;
}): string[] {
  const covered = new Set(
    [
      ...input.importedProjectLocales,
      ...(input.sourceUnchanged !== false ? input.pushReadyProjectLocales : []),
    ].map((locale) => normalizeIntercomLocaleTag(locale).toLowerCase()),
  );
  return input.jobTargetLocales.filter(
    (locale) => !covered.has(normalizeIntercomLocaleTag(locale).toLowerCase()),
  );
}

export async function importIntercomTargetTranslations(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  articleId?: string;
  localeMapping: {
    sourceIntercomLocale: string | null;
    jobTargetLocales: readonly string[];
    intercomTargetLocales: readonly string[];
  };
  localeContent: Record<string, IntercomLocaleContentFields>;
  policy: IntercomExistingTranslationPolicy;
  storedImportedHashes?: Record<string, string> | null;
  extractEntries?: ExtractIntercomTargetEntries;
  loadPresence?: typeof loadIntercomLocaleTranslationPresence;
  assertConfigStillCurrent?: () => Promise<void>;
}): Promise<ImportIntercomTargetTranslationsResult> {
  const candidates = selectIntercomTargetLocalesToImport({
    localeMapping: input.localeMapping,
    localeContent: input.localeContent,
  });
  const loadPresence = input.loadPresence ?? loadIntercomLocaleTranslationPresence;
  const presenceByLocale = await loadPresence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocales: input.localeMapping.jobTargetLocales,
    storedImportedHashes: input.storedImportedHashes ?? {},
  });

  const toImport: IntercomTargetLocaleToImport[] = [];
  const skippedLocales: string[] = [];
  const importedLocales: string[] = [];
  const failedLocales: string[] = [];
  const importedTranslationHashes: Record<string, string> = {
    ...input.storedImportedHashes,
  };

  for (const candidate of candidates) {
    const incomingHash = hashIntercomArticleContent(candidate.fields);
    const action = decideIntercomExistingTranslationAction({
      policy: input.policy,
      presence: presenceByLocale.get(candidate.projectLocale) ?? {
        pushReady: false,
        hasExistingTranslation: false,
        importProvenanceOnly: false,
        contentHash: null,
      },
      incomingHash,
    });
    if (action === "skip") {
      skippedLocales.push(candidate.projectLocale);
      continue;
    }
    toImport.push(candidate);
  }

  if (toImport.length === 0) {
    return {
      importedLocales,
      skippedLocales,
      failedLocales,
      importedTranslationHashes,
      pushReadyLocales: pushReadyLocalesFromPresence(presenceByLocale),
    };
  }

  const sourceVersion = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  const extractEntries = input.extractEntries ?? extractIntercomTargetEntriesWithSandbox;
  let entriesByLocale = new Map<string, Record<string, string>>();
  try {
    await input.assertConfigStillCurrent?.();
    entriesByLocale = await extractEntries(
      toImport.map((locale) => ({
        projectLocale: locale.projectLocale,
        markdown: serializeIntercomArticleMarkdown(locale.fields),
      })),
    );
  } catch (error) {
    logger.warn(
      {
        projectId: input.projectId,
        articleId: input.articleId,
        repositorySourceFileId: sourceVersion?.repositorySourceFileId ?? null,
        error: error instanceof Error ? error.message : String(error),
      },
      "intercom target entry extract failed",
    );
    return {
      importedLocales,
      skippedLocales,
      failedLocales: toImport.map((locale) => locale.projectLocale),
      importedTranslationHashes,
      pushReadyLocales: pushReadyLocalesFromPresence(presenceByLocale),
    };
  }

  for (const candidate of toImport) {
    try {
      await input.assertConfigStillCurrent?.();
      await writeImportedIntercomTargetLocale({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        repositorySourceFileId: sourceVersion?.repositorySourceFileId ?? null,
        candidate,
        entries: entriesByLocale.get(candidate.projectLocale) ?? {},
        force: input.policy !== "seed_empty",
      });
      importedLocales.push(candidate.projectLocale);
      importedTranslationHashes[candidate.projectLocale] = hashIntercomArticleContent(
        candidate.fields,
      );
    } catch (error) {
      logger.warn(
        {
          projectId: input.projectId,
          articleId: input.articleId,
          repositorySourceFileId: sourceVersion?.repositorySourceFileId ?? null,
          targetLocale: candidate.projectLocale,
          error: error instanceof Error ? error.message : String(error),
        },
        "intercom target locale import failed",
      );
      failedLocales.push(candidate.projectLocale);
    }
  }

  return {
    importedLocales,
    skippedLocales,
    failedLocales,
    importedTranslationHashes,
    pushReadyLocales: [
      ...new Set([...pushReadyLocalesFromPresence(presenceByLocale), ...importedLocales]),
    ],
  };
}

async function writeImportedIntercomTargetLocale(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  repositorySourceFileId: string | null;
  candidate: IntercomTargetLocaleToImport;
  entries: Record<string, string>;
  force: boolean;
}) {
  const markdown = serializeIntercomArticleMarkdown(input.candidate.fields);
  const variant = await replaceImageVariantBytes({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.candidate.projectLocale,
    content: Buffer.from(markdown, "utf8"),
    contentType: "text/markdown",
    filename: sandboxFilenameForLocale(input.candidate.projectLocale),
    repositorySourceFileId: input.repositorySourceFileId,
    force: input.force,
    provenance: "import",
    status: "approved",
  });
  if (!variant.ok) {
    throw new Error(variant.error.code);
  }

  if (Object.keys(input.entries).length > 0) {
    await importApprovedProjectTranslationsFromEntries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.candidate.projectLocale,
      entries: input.entries,
    });
  }
}

function pushReadyLocalesFromPresence(
  presenceByLocale: Map<string, IntercomLocaleTranslationPresence>,
): string[] {
  return [...presenceByLocale.entries()]
    .filter(([, presence]) => presence.pushReady)
    .map(([locale]) => locale);
}

export async function loadIntercomLocaleTranslationPresence(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocales: readonly string[];
  storedImportedHashes: Record<string, string>;
}): Promise<Map<string, IntercomLocaleTranslationPresence>> {
  const presenceByLocale = new Map<string, IntercomLocaleTranslationPresence>();
  if (input.targetLocales.length === 0) {
    return presenceByLocale;
  }

  const approvedByPath = await loadApprovedIntercomArticleValuesByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePaths: [input.sourcePath],
    targetLocales: [...input.targetLocales],
  });
  const approvedByLocale = approvedByPath.get(input.sourcePath) ?? new Map();

  const variants = await db
    .select({
      targetLocale: schema.projectImageVariants.targetLocale,
      status: schema.projectImageVariants.status,
      provenance: schema.projectImageVariants.provenance,
    })
    .from(schema.projectImageVariants)
    .where(
      and(
        eq(schema.projectImageVariants.organizationId, input.organizationId),
        eq(schema.projectImageVariants.projectId, input.projectId),
        eq(schema.projectImageVariants.sourcePath, input.sourcePath),
        inArray(schema.projectImageVariants.targetLocale, [...input.targetLocales]),
      ),
    );

  const [sourceFile] = await db
    .select({ id: schema.repositorySourceFiles.id })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
      ),
    )
    .limit(1);

  const keyedProvenances = new Map<string, Set<string>>();
  const keyedTranslationLocales = new Set<string>();
  if (sourceFile) {
    const keys = await db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
        ),
      );
    if (keys.length > 0) {
      const translations = await db
        .select({
          targetLocale: schema.projectTranslations.targetLocale,
          provenance: schema.projectTranslations.provenance,
          status: schema.projectTranslations.status,
        })
        .from(schema.projectTranslations)
        .where(
          and(
            eq(schema.projectTranslations.organizationId, input.organizationId),
            eq(schema.projectTranslations.projectId, input.projectId),
            inArray(
              schema.projectTranslations.translationKeyId,
              keys.map((key) => key.id),
            ),
            inArray(schema.projectTranslations.targetLocale, [...input.targetLocales]),
          ),
        );
      for (const translation of translations) {
        keyedTranslationLocales.add(translation.targetLocale);
        if (translation.status !== "approved") {
          continue;
        }
        const set = keyedProvenances.get(translation.targetLocale) ?? new Set<string>();
        set.add(translation.provenance);
        keyedProvenances.set(translation.targetLocale, set);
      }
    }
  }

  for (const targetLocale of input.targetLocales) {
    const approved = approvedByLocale.get(targetLocale) ?? null;
    const variant = variants.find((row) => row.targetLocale === targetLocale);
    const provenances = new Set<string>();
    if (variant?.status === "approved") {
      provenances.add(variant.provenance);
    }
    for (const provenance of keyedProvenances.get(targetLocale) ?? []) {
      provenances.add(provenance);
    }

    presenceByLocale.set(targetLocale, {
      pushReady: approved != null,
      hasExistingTranslation: variant != null || keyedTranslationLocales.has(targetLocale),
      importProvenanceOnly:
        provenances.size > 0 && [...provenances].every((value) => value === "import"),
      contentHash:
        input.storedImportedHashes[targetLocale] ??
        (approved ? hashIntercomArticleContent(approved) : null),
    });
  }

  return presenceByLocale;
}
