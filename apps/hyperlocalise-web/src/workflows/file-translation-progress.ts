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
import { createHash } from "node:crypto";
import { z } from "zod";

import {
  isSourceTextKey,
  parseTranslationFile as parseCanvaTranslationFile,
} from "@/lib/canva/segment-file";
import {
  isFigmaStampSegmentKey,
  parseTranslationFile as parseFigmaTranslationFile,
  propagateFigmaTranslationsBySharedSource,
} from "@/lib/figma/segment-file";

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
    // never wrote them. Keep the prefill so pagination can confirm it.
    const prefill = input.prefills[key];
    if (prefill?.trim()) {
      collected[key] = prefill;
      continue;
    }
    if (key in input.prefills) {
      continue;
    }
    throw new Error("completed translation is missing from output");
  }
  return collected;
}

/** Copy a known translation onto every source key that shares that source text. */
export function remapPrefillsOntoSourceKeys(
  sourceEntries: Record<string, string>,
  prefills: Record<string, string>,
): Record<string, string> {
  const remapped = { ...prefills };
  const translationBySource = new Map<string, string>();
  for (const [key, translation] of Object.entries(prefills)) {
    const source = sourceEntries[key]?.trim();
    const value = translation.trim();
    if (!source || !value || value === source) {
      continue;
    }
    if (!translationBySource.has(source)) {
      translationBySource.set(source, translation);
    }
  }
  if (translationBySource.size === 0) {
    return remapped;
  }
  for (const [key, source] of Object.entries(sourceEntries)) {
    if (remapped[key]?.trim()) {
      continue;
    }
    const mapped = translationBySource.get(source.trim());
    if (mapped) {
      remapped[key] = mapped;
    }
  }
  return remapped;
}

/** When the sandbox target file and `hl entries` disagree, pick the value that
 * actually looks translated. Prefer on-disk file text when both differ. */
export function resolveCollectedTranslationEntryValue(
  sourceText: string,
  fileValue: string | undefined,
  hlValue: string | undefined,
): string | undefined {
  const source = sourceText.trim();
  const file = fileValue?.trim() ?? "";
  const hl = hlValue?.trim() ?? "";
  if (!file && !hl) {
    return undefined;
  }
  const fileDiffersFromSource = file.length > 0 && file !== source;
  const hlDiffersFromSource = hl.length > 0 && hl !== source;
  if (fileDiffersFromSource && hlDiffersFromSource && file !== hl) {
    return file;
  }
  if (fileDiffersFromSource) {
    return file;
  }
  if (hlDiffersFromSource) {
    return hl;
  }
  return file.length > 0 ? file : hl;
}

export function mergeCanvaJsonExtractedEntries(input: {
  keys: readonly string[];
  sourceEntries: Record<string, string>;
  fileExtracted: Record<string, string>;
  hlExtracted: Record<string, string>;
}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const key of input.keys) {
    const resolved = resolveCollectedTranslationEntryValue(
      input.sourceEntries[key] ?? "",
      input.fileExtracted[key],
      input.hlExtracted[key],
    );
    if (resolved?.trim()) {
      merged[key] = resolved;
    }
  }
  return merged;
}

function usesCanvaSourceTextKeys(sourceEntries: Record<string, string>): boolean {
  return Object.keys(sourceEntries).some(isSourceTextKey);
}

function usesFigmaStampSourceKeys(sourceEntries: Record<string, string>): boolean {
  return Object.keys(sourceEntries).some(isFigmaStampSegmentKey);
}

function usesIntegrationJsonSourceTextKeys(sourceEntries: Record<string, string>): boolean {
  return usesCanvaSourceTextKeys(sourceEntries) || usesFigmaStampSourceKeys(sourceEntries);
}

function parseIntegrationJsonTranslationFile(
  content: Record<string, unknown>,
  sourceEntries: Record<string, string>,
): Record<string, string> {
  if (usesFigmaStampSourceKeys(sourceEntries)) {
    return parseFigmaTranslationFile(content);
  }
  if (usesCanvaSourceTextKeys(sourceEntries)) {
    return parseCanvaTranslationFile(content);
  }
  return {};
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

function lockPathMatchesOutput(lockPath: string, outputFilename: string): boolean {
  const normalized = lockPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized === outputFilename || normalized.endsWith(`/${outputFilename}`)) {
    return true;
  }
  return normalized.split("/").pop() === outputFilename;
}

function hashedSourceLockAliases(sourceText: string): string[] {
  const sha256 = createHash("sha256").update(sourceText, "utf8").digest("hex");
  const normalized = sourceText.normalize("NFKC").replace(/\s+/g, " ").trim();
  const nfkc = createHash("sha256").update(normalized, "utf8").digest("hex");
  return [
    sha256.slice(0, 16),
    sha256.slice(0, 32),
    nfkc.slice(0, 16),
    `json.${sha256.slice(0, 16)}`,
    `json.${nfkc.slice(0, 16)}`,
  ];
}

/** Map CLI lock keys (JSON paths or content hashes) onto extract source keys. */
export function sourceKeysForLockCompletions(
  sourceEntries: Record<string, string>,
  lockKeys: readonly string[],
): string[] {
  const mapped = new Set<string>();
  const keysBySource = new Map<string, string[]>();
  const keysByHash = new Map<string, string[]>();
  for (const [key, source] of Object.entries(sourceEntries)) {
    const text = source?.trim();
    if (!text) {
      continue;
    }
    const siblings = keysBySource.get(text) ?? [];
    siblings.push(key);
    keysBySource.set(text, siblings);
    for (const alias of hashedSourceLockAliases(text)) {
      const hashed = keysByHash.get(alias) ?? [];
      hashed.push(key);
      keysByHash.set(alias, hashed);
    }
  }
  for (const lockKey of lockKeys) {
    if (sourceEntries[lockKey]?.trim()) {
      mapped.add(lockKey);
      for (const sibling of keysBySource.get(sourceEntries[lockKey]!.trim()) ?? []) {
        mapped.add(sibling);
      }
      continue;
    }
    const stripped = lockKey.replace(/^(json|html|md)\./, "").replace(/\.\d+$/, "");
    for (const sibling of [
      ...(keysByHash.get(lockKey) ?? []),
      ...(keysByHash.get(stripped) ?? []),
    ]) {
      mapped.add(sibling);
    }
  }
  return [...mapped];
}

function applyHashedEntriesOntoSourceKeys(
  sourceEntries: Record<string, string>,
  extracted: Record<string, string>,
): Record<string, string> {
  const out = { ...extracted };
  for (const [key, source] of Object.entries(sourceEntries)) {
    if (out[key]?.trim() || !source?.trim()) {
      continue;
    }
    for (const alias of hashedSourceLockAliases(source.trim())) {
      const value = extracted[alias];
      if (value?.trim()) {
        out[key] = value;
        break;
      }
    }
  }
  return out;
}

export function completedFileTranslationKeys(lock: unknown, outputFilename: string): string[] {
  const parsed = lockSchema.parse(lock);
  const entries = Object.entries(parsed.run_completed ?? {}).find(([path]) =>
    lockPathMatchesOutput(path, outputFilename),
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
  /** Busts workflow step memoization when a new `hl run` finishes. */
  hlRunFingerprint?: string;
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
  const integrationJsonCollect = usesIntegrationJsonSourceTextKeys(input.sourceEntries);
  const figmaJsonCollect = usesFigmaStampSourceKeys(input.sourceEntries);
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
    const localePrefills = remapPrefillsOntoSourceKeys(
      input.sourceEntries,
      input.prefills[locale] ?? {},
    );
    const lockKeys = completedFileTranslationKeys(lock, filename);
    const keys = [
      ...new Set([
        ...sourceKeysForLockCompletions(input.sourceEntries, lockKeys),
        ...Object.keys(localePrefills),
      ]),
    ].filter(
      (key) => input.sourceEntries[key]?.trim() && !(key in (input.confirmed[locale] ?? {})),
    );
    if (keys.length === 0) continue;
    const extracted = await extractSandboxEntries(input.sandboxId, filename, {
      sourcePath: input.inputFilename,
    });
    if (!extracted.ok) throw new Error("failed to extract completed translations");
    const hlExtracted = applyHashedEntriesOntoSourceKeys(
      input.sourceEntries,
      hlEntriesPayloadToStringMap(extracted.entries),
    );
    let extractedForCollect = hlExtracted;
    if (integrationJsonCollect && filename.endsWith(".json")) {
      const targetRaw = utf8FromStoredFileContent(
        await readTranslatedFile(input.sandboxId, filename),
      );
      const fileExtracted = parseIntegrationJsonTranslationFile(
        JSON.parse(targetRaw) as Record<string, unknown>,
        input.sourceEntries,
      );
      extractedForCollect = mergeCanvaJsonExtractedEntries({
        keys,
        sourceEntries: input.sourceEntries,
        fileExtracted,
        hlExtracted,
      });
    }
    if (figmaJsonCollect) {
      extractedForCollect = propagateFigmaTranslationsBySharedSource(
        input.sourceEntries,
        extractedForCollect,
      );
    }
    let collected = collectCompletedTranslationPageEntries({
      keys,
      extracted: extractedForCollect,
      prefills: localePrefills,
    });
    if (figmaJsonCollect) {
      collected = propagateFigmaTranslationsBySharedSource(input.sourceEntries, collected);
    }
    if (Object.keys(collected).length > 0) {
      delta[locale] = collected;
    }
  }
  return delta;
}
