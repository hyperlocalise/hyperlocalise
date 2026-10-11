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

export function discoverBrazeLocaleCopies(input: {
  sourceName: string;
  suffixes: readonly string[];
  library: ReadonlyArray<{ id: string; name: string }>;
  copyName: (sourceName: string, suffix: string) => string;
}): {
  localeCopyIds: Record<string, string>;
  localeCopyNames: Record<string, string>;
} {
  const localeCopyIds: Record<string, string> = {};
  const localeCopyNames: Record<string, string> = {};
  const byName = new Map<string, { id: string; name: string }>();
  for (const item of input.library) {
    if (!byName.has(item.name)) {
      byName.set(item.name, item);
    }
  }
  for (const suffix of input.suffixes) {
    const token = suffix.trim();
    if (!token) {
      continue;
    }
    const name = input.copyName(input.sourceName, token);
    const match = byName.get(name);
    if (!match) {
      continue;
    }
    localeCopyIds[token] = match.id;
    localeCopyNames[token] = match.name;
  }
  return { localeCopyIds, localeCopyNames };
}

export function mergeBrazeLocaleCopies(
  discovered: {
    localeCopyIds: Record<string, string>;
    localeCopyNames: Record<string, string>;
  },
  existing?: {
    localeCopyIds?: Record<string, string> | null;
    localeCopyNames?: Record<string, string> | null;
  },
): {
  localeCopyIds: Record<string, string>;
  localeCopyNames: Record<string, string>;
} {
  return {
    localeCopyIds: { ...discovered.localeCopyIds, ...existing?.localeCopyIds },
    localeCopyNames: { ...discovered.localeCopyNames, ...existing?.localeCopyNames },
  };
}

export function brazeLibraryNeedsFullCopyScan(input: {
  sourceNames: readonly string[];
  suffixes: readonly string[];
  library: ReadonlyArray<{ id: string; name: string }>;
  existingCopyIdsBySourceName: ReadonlyMap<string, Record<string, string>>;
  copyName: (sourceName: string, suffix: string) => string;
}): boolean {
  for (const sourceName of input.sourceNames) {
    const existing = input.existingCopyIdsBySourceName.get(sourceName) ?? {};
    const discovered = discoverBrazeLocaleCopies({
      sourceName,
      suffixes: input.suffixes,
      library: input.library,
      copyName: input.copyName,
    });
    for (const suffix of input.suffixes) {
      const token = suffix.trim();
      if (token && !existing[token] && !discovered.localeCopyIds[token]) {
        return true;
      }
    }
  }
  return false;
}

export function remainingBrazeJobLocales(input: {
  jobTargetLocales: readonly string[];
  brazeSuffixes: readonly string[];
  importedHashes: Record<string, string>;
  skippedExistingSuffixes: readonly string[];
}): string[] {
  const skip = new Set([...Object.keys(input.importedHashes), ...input.skippedExistingSuffixes]);
  const remaining: string[] = [];
  for (let index = 0; index < input.jobTargetLocales.length; index += 1) {
    const projectLocale = input.jobTargetLocales[index];
    const suffix = input.brazeSuffixes[index];
    if (!projectLocale || !suffix || skip.has(suffix)) {
      continue;
    }
    remaining.push(projectLocale);
  }
  return remaining;
}
