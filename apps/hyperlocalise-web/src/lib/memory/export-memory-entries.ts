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
import { and, asc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { serializeMemoryEntriesTmx } from "./tmx/serialize-tmx";
import type { TmxExportEntry } from "./tmx/tmx-types";

const EXPORT_PAGE_SIZE = 500;

export type MemoryExportFilters = {
  sourceLocale?: string;
  targetLocale?: string;
};

function asTuid(metadata: Record<string, unknown>, externalKey: string | null) {
  if (typeof metadata.tuid === "string" && metadata.tuid.trim()) {
    return metadata.tuid;
  }
  if (externalKey?.startsWith("tmx:")) {
    const parts = externalKey.split(":");
    return parts[1] || undefined;
  }
  return undefined;
}

export async function loadMemoryEntriesForExport(
  memoryId: string,
  filters: MemoryExportFilters = {},
): Promise<TmxExportEntry[]> {
  const entries: TmxExportEntry[] = [];
  let offset = 0;

  for (;;) {
    const conditions = [eq(schema.memoryEntries.memoryId, memoryId)];
    if (filters.sourceLocale) {
      conditions.push(eq(schema.memoryEntries.sourceLocale, filters.sourceLocale));
    }
    if (filters.targetLocale) {
      conditions.push(eq(schema.memoryEntries.targetLocale, filters.targetLocale));
    }

    const rows = await db
      .select({
        sourceLocale: schema.memoryEntries.sourceLocale,
        targetLocale: schema.memoryEntries.targetLocale,
        sourceText: schema.memoryEntries.sourceText,
        targetText: schema.memoryEntries.targetText,
        externalKey: schema.memoryEntries.externalKey,
        metadata: schema.memoryEntries.metadata,
      })
      .from(schema.memoryEntries)
      .where(and(...conditions))
      .orderBy(asc(schema.memoryEntries.createdAt), asc(schema.memoryEntries.id))
      .limit(EXPORT_PAGE_SIZE)
      .offset(offset);

    for (const row of rows) {
      entries.push({
        sourceLocale: row.sourceLocale,
        targetLocale: row.targetLocale,
        sourceText: row.sourceText,
        targetText: row.targetText,
        tuid: asTuid(row.metadata ?? {}, row.externalKey),
        metadata: row.metadata ?? {},
      });
    }

    if (rows.length < EXPORT_PAGE_SIZE) {
      break;
    }
    offset += rows.length;
  }

  return entries;
}

export function buildMemoryTmxFilename(memoryName: string, filters: MemoryExportFilters) {
  const slug = memoryName.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "translation-memory";
  if (filters.sourceLocale && filters.targetLocale) {
    return `${slug}-${filters.sourceLocale}-${filters.targetLocale}.tmx`;
  }
  return `${slug}.tmx`;
}

export async function exportMemoryEntriesTmx(input: {
  memoryId: string;
  memoryName: string;
  filters?: MemoryExportFilters;
}) {
  const filters = input.filters ?? {};
  const entries = await loadMemoryEntriesForExport(input.memoryId, filters);
  return {
    body: serializeMemoryEntriesTmx(entries, {
      srclang: filters.sourceLocale ?? entries[0]?.sourceLocale,
      creationtool: "Hyperlocalise",
    }),
    filename: buildMemoryTmxFilename(input.memoryName, filters),
    entryCount: entries.length,
  };
}
