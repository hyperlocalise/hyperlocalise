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
  const lock: unknown = JSON.parse(
    (await readTranslatedFile(input.sandboxId, ".hyperlocalise.lock.json")).toString("utf8"),
  );
  const delta: Record<string, Record<string, string>> = {};
  for (const [locale, filename] of Object.entries(input.outputFilenames)) {
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
