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

/** HTML keys are tag paths. The pinned sandbox CLI still hashes content, so the
 * lock and a re-extracted target file never share keys. Collect only path keys
 * that belong to lock-completed folded hashes; leftover source fallbacks stay out. */
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

export async function collectFileTranslationPageStep(input: {
  sandboxId: string;
  inputFilename: string;
  outputFilenames: Record<string, string>;
  sourceEntries: Record<string, string>;
  prefills: Record<string, Record<string, string>>;
  confirmed: Record<string, Record<string, string>>;
}) {
  "use step";
  const { readTranslatedFile, extractSandboxEntries } = await import("@/lib/translation/sandbox");
  const { hlEntriesPayloadToStringMap } = await import("@/lib/projects/files/hl-entries");
  const {
    extractHtmlIngestEntries,
    htmlCompletedPathKeysFromLock,
    isHtmlTranslationSourcePath,
    utf8FromStoredFileContent,
  } = await import("@/lib/projects/files/html-ingest-entries");
  const htmlSource = isHtmlTranslationSourcePath(input.inputFilename);
  const lock: unknown = JSON.parse(
    utf8FromStoredFileContent(
      await readTranslatedFile(input.sandboxId, ".hyperlocalise.lock.json"),
    ),
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
      const collected = collectHtmlTranslationPageEntries({
        sourceEntries: input.sourceEntries,
        extracted,
        confirmed: input.confirmed[locale] ?? {},
        completedPathKeys: htmlCompletedPathKeysFromLock(
          sourceHtml,
          completedFileTranslationKeys(lock, filename),
        ),
      });
      if (Object.keys(collected).length > 0) {
        delta[locale] = collected;
      }
      continue;
    }
    const keys = [
      ...new Set([
        ...completedFileTranslationKeys(lock, filename),
        ...Object.keys(input.prefills[locale] ?? {}),
      ]),
    ].filter(
      (key) => input.sourceEntries[key]?.trim() && !(key in (input.confirmed[locale] ?? {})),
    );
    if (keys.length === 0) continue;
    const extracted = await extractSandboxEntries(input.sandboxId, filename, {
      sourcePath: input.inputFilename,
    });
    if (!extracted.ok) throw new Error("failed to extract completed translations");
    const collected = collectCompletedTranslationPageEntries({
      keys,
      extracted: hlEntriesPayloadToStringMap(extracted.entries),
      prefills: input.prefills[locale] ?? {},
    });
    if (Object.keys(collected).length > 0) {
      delta[locale] = collected;
    }
  }
  return delta;
}
