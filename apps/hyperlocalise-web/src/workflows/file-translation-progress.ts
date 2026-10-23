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
import { z } from "zod";

export const fileTranslationReportSchema = z.object({
  deferredByLimit: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type FileTranslationReport = z.infer<typeof fileTranslationReportSchema>;

const CLI_TASK_FAILURE_MARKER = /run completed with failures:\s*\d+/;

/** Task-level `hl run` failures are progress when some keys succeeded.
 * Other nonzero exits (output write, lock save) stay fatal even if the
 * report already counted successes. */
export function isFileTranslationCliHardFailure(
  progress: Pick<FileTranslationReport, "succeeded" | "failed">,
  exitCode: number,
  output = "",
): boolean {
  if (exitCode !== 0 && !CLI_TASK_FAILURE_MARKER.test(output)) {
    return true;
  }
  if (progress.succeeded > 0) {
    return false;
  }
  return exitCode !== 0 || progress.failed > 0;
}

const completionSchema = z.object({ s: z.string(), t: z.string() });
const lockSchema = z.object({
  run_completed: z.record(z.string(), z.record(z.string(), completionSchema)).optional(),
});

/** Read the grouped completion format written by the pinned CLI. File contents alone
 * cannot identify completed keys: template-based outputs include source fallbacks. */
export function collectCompletedTranslationPageEntries(input: {
  keys: string[];
  extracted: Record<string, string>;
  prefills: Record<string, string>;
}): Record<string, string> {
  const collected: Record<string, string> = {};
  for (const key of input.keys) {
    const value = input.extracted[key];
    if (value?.trim()) {
      collected[key] = value;
      continue;
    }
    // TM/project prefills are unioned into the key set even when hl run
    // never wrote them. Missing prefill-only keys must not fail the page.
    if (key in input.prefills) {
      continue;
    }
    throw new Error("completed translation is missing from output");
  }
  return collected;
}

/** HTML keys are tag paths. CLI 1.13.3 hashed folded paragraphs, so the lock and
 * a re-extracted target never share keys. CLI 1.13.4+ writes the same path keys
 * as CAT. Collect only path keys that a lock completion named — leftover source
 * fallbacks stay out. */
export function collectHtmlTranslationPageEntries(input: {
  sourceEntries: Record<string, string>;
  extracted: Record<string, string>;
  confirmed: Record<string, string>;
  completedPathKeys: readonly string[];
}): Record<string, string> {
  const allowed = new Set(input.completedPathKeys);
  const collected: Record<string, string> = {};
  for (const [key, sourceText] of Object.entries(input.sourceEntries)) {
    if (!sourceText?.trim() || key in input.confirmed || !allowed.has(key)) {
      continue;
    }
    const value = input.extracted[key];
    if (value?.trim()) {
      collected[key] = value;
    }
  }
  return collected;
}

export function completedFileTranslationKeys(lock: unknown, outputFilename: string): string[] {
  const parsed = lockSchema.parse(lock);
  const entries = Object.entries(parsed.run_completed ?? {}).find(
    ([path]) => path === outputFilename || path.endsWith(`/${outputFilename}`),
  );
  return Object.keys(entries?.[1] ?? {});
}

const SHARED_LOCALE_TARGET_EXTENSION = /\.(xlsx|csv|tsv)$/i;

/**
 * Map lock completion keys onto source entry keys. The CLI suffixes every
 * `.xlsx`/`.csv`/`.tsv` lock identity with `::locale` so two locales of one
 * workbook stay distinct; `hl entries` and CAT still use `key`. Spreadsheet keys
 * are user-provided and may themselves end in `::locale`, so the suffix is
 * stripped by target format rather than by checking which key exists.
 */
export function sourceKeysFromFileTranslationLock(
  lockKeys: readonly string[],
  outputFilename: string,
  targetLocale?: string,
): string[] {
  const locale = targetLocale?.trim();
  if (!locale || !SHARED_LOCALE_TARGET_EXTENSION.test(outputFilename)) {
    return [...lockKeys];
  }
  const suffix = `::${locale}`;
  return lockKeys.map((key) =>
    key.length > suffix.length && key.endsWith(suffix) ? key.slice(0, -suffix.length) : key,
  );
}

/** CLI lockfile in the sandbox working directory. */
export const sandboxCliLockfilePath = ".hyperlocalise.lock.json";
/** Non-hidden copy `runTranslationStep` writes after `hl run`, including `{}` when the CLI skipped the lockfile. */
export const sandboxCliLockfileCopyPath = "/tmp/hyperlocalise.lock.json";

export function materializeSandboxLockfileCommand(): string {
  return (
    `if [ -f '${sandboxCliLockfilePath}' ]; then ` +
    `cp '${sandboxCliLockfilePath}' '${sandboxCliLockfileCopyPath}'; ` +
    `else printf '%s\\n' '{}' > '${sandboxCliLockfileCopyPath}'; fi`
  );
}

function isMissingTranslatedFileError(error: unknown, path: string): boolean {
  return error instanceof Error && error.message === `failed to read translated file: ${path}`;
}

async function readSandboxLockFile(
  sandboxId: string,
  readTranslatedFile: (sandboxId: string, path: string) => Promise<Buffer>,
  utf8FromStoredFileContent: (content: unknown) => string,
): Promise<unknown> {
  for (const path of [sandboxCliLockfilePath, sandboxCliLockfileCopyPath]) {
    try {
      const text = utf8FromStoredFileContent(await readTranslatedFile(sandboxId, path)).trim();
      if (!text) {
        continue;
      }
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (isMissingTranslatedFileError(error, path)) {
        continue;
      }
      throw error;
    }
  }
  // Prefill-only or empty `hl run` may not write a lockfile. Collect then
  // falls back to prefills and leaves HTML path keys unconfirmed.
  return {};
}

export async function collectFileTranslationPageStep(input: {
  sandboxId: string;
  inputFilename: string;
  outputFilenames: Record<string, string>;
  sourceEntries: Record<string, string>;
  /** Names the source column when reading `.xlsx` outputs. */
  sourceLocale?: string;
  prefills: Record<string, Record<string, string>>;
  confirmed: Record<string, Record<string, string>>;
  /** Busts workflow step memoization when a new `hl run` finishes. */
  hlRunFingerprint?: string;
}) {
  "use step";
  const { readTranslatedFile, extractSandboxEntries } = await import("@/lib/translation/sandbox");
  const { hlEntriesPayloadToStringMap } = await import("@/lib/projects/files/hl-entries");
  const { sandboxEntriesLocaleOptions } = await import("@/lib/translation/sandbox-cli-release");
  const {
    extractHtmlIngestEntries,
    htmlCompletedPathKeysFromLock,
    htmlSourceFallbackPathKeys,
    isHtmlTranslationSourcePath,
    utf8FromStoredFileContent,
  } = await import("@/lib/projects/files/html-ingest-entries");
  const htmlSource = isHtmlTranslationSourcePath(input.inputFilename);
  const lock = await readSandboxLockFile(
    input.sandboxId,
    readTranslatedFile,
    utf8FromStoredFileContent,
  );
  const sourceHtml = htmlSource
    ? utf8FromStoredFileContent(await readTranslatedFile(input.sandboxId, input.inputFilename))
    : "";
  const delta: Record<string, Record<string, string>> = {};
  for (const [locale, filename] of Object.entries(input.outputFilenames)) {
    if (htmlSource || isHtmlTranslationSourcePath(filename)) {
      const extracted = extractHtmlIngestEntries(
        utf8FromStoredFileContent(await readTranslatedFile(input.sandboxId, filename)),
      );
      const sourceFallbacks = htmlSourceFallbackPathKeys(sourceHtml, extracted);
      const collected = collectHtmlTranslationPageEntries({
        sourceEntries: input.sourceEntries,
        extracted,
        confirmed: input.confirmed[locale] ?? {},
        completedPathKeys: htmlCompletedPathKeysFromLock(
          sourceHtml,
          completedFileTranslationKeys(lock, filename),
        ).filter((key) => !sourceFallbacks.has(key)),
      });
      if (Object.keys(collected).length > 0) {
        delta[locale] = collected;
      }
      continue;
    }
    const keys = [
      ...new Set([
        ...sourceKeysFromFileTranslationLock(
          completedFileTranslationKeys(lock, filename),
          filename,
          locale,
        ),
        ...Object.keys(input.prefills[locale] ?? {}),
      ]),
    ].filter(
      (key) => input.sourceEntries[key]?.trim() && !(key in (input.confirmed[locale] ?? {})),
    );
    if (keys.length === 0) continue;
    const extracted = await extractSandboxEntries(input.sandboxId, filename, {
      sourcePath: input.inputFilename,
      ...sandboxEntriesLocaleOptions(filename, input.sourceLocale, locale),
    });
    if (!extracted.ok) throw new Error("failed to extract completed translations");
    const hlExtracted = hlEntriesPayloadToStringMap(extracted.entries);
    const collected = collectCompletedTranslationPageEntries({
      keys,
      extracted: hlExtracted,
      prefills: input.prefills[locale] ?? {},
    });
    if (Object.keys(collected).length > 0) {
      delta[locale] = collected;
    }
  }
  return delta;
}
