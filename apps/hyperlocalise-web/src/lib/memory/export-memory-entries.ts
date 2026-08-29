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
import { and, asc, eq, gt, or } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import { TMX_EXPORT_PAGE_SIZE } from "./tmx/tmx-constants";
import {
  groupEntriesForTmxExport,
  serializeTmxFooterXml,
  serializeTmxHeaderXml,
  serializeTmxUnitsXml,
} from "./tmx/serialize-tmx";
import type { TmxExportEntry } from "./tmx/tmx-types";

export type MemoryExportFilters = {
  sourceLocale?: string;
  targetLocale?: string;
};

/** Resolves the TMX tuid used when grouping multilingual export units. */
export function asTuid(metadata: Record<string, unknown>, externalKey: string | null) {
  if (typeof metadata.tuid === "string" && metadata.tuid.trim()) {
    return metadata.tuid;
  }
  if (externalKey?.startsWith("tmx:")) {
    const parts = externalKey.split(":");
    return parts[1] || undefined;
  }
  return undefined;
}

function toExportEntry(row: {
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
  externalKey: string | null;
  metadata: Record<string, unknown> | null;
}): TmxExportEntry {
  return {
    sourceLocale: row.sourceLocale,
    targetLocale: row.targetLocale,
    sourceText: row.sourceText,
    targetText: row.targetText,
    tuid: asTuid(row.metadata ?? {}, row.externalKey),
    metadata: row.metadata ?? {},
  };
}

/**
 * Holds back the trailing same-tuid group so a full export page does not split
 * multilingual variants across streamed XML chunks.
 */
export function trailingTuidGroup(entries: TmxExportEntry[]) {
  const lastTuid = entries.at(-1)?.tuid;
  if (!lastTuid) {
    return { flush: entries, pending: [] as TmxExportEntry[] };
  }
  let start = entries.length - 1;
  while (start > 0 && entries[start - 1]?.tuid === lastTuid) {
    start -= 1;
  }
  return { flush: entries.slice(0, start), pending: entries.slice(start) };
}

async function loadExportPage(
  memoryId: string,
  filters: MemoryExportFilters,
  cursor?: { createdAt: Date; id: string },
) {
  const conditions = [eq(schema.memoryEntries.memoryId, memoryId)];
  if (filters.sourceLocale) {
    conditions.push(eq(schema.memoryEntries.sourceLocale, filters.sourceLocale));
  }
  if (filters.targetLocale) {
    conditions.push(eq(schema.memoryEntries.targetLocale, filters.targetLocale));
  }
  if (cursor) {
    const afterCursor = or(
      gt(schema.memoryEntries.createdAt, cursor.createdAt),
      and(
        eq(schema.memoryEntries.createdAt, cursor.createdAt),
        gt(schema.memoryEntries.id, cursor.id),
      ),
    );
    if (afterCursor) {
      conditions.push(afterCursor);
    }
  }

  return db
    .select({
      id: schema.memoryEntries.id,
      createdAt: schema.memoryEntries.createdAt,
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
    .limit(TMX_EXPORT_PAGE_SIZE);
}

export function buildMemoryTmxFilename(memoryName: string, filters: MemoryExportFilters) {
  const slug =
    memoryName
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "translation-memory";
  if (filters.sourceLocale && filters.targetLocale) {
    return `${slug}-${filters.sourceLocale}-${filters.targetLocale}.tmx`;
  }
  return `${slug}.tmx`;
}

export function createMemoryTmxExportStream(input: {
  memoryId: string;
  filters?: MemoryExportFilters;
}) {
  const filters = input.filters ?? {};
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor: { createdAt: Date; id: string } | undefined;
      let pending: TmxExportEntry[] = [];
      let wroteHeader = false;

      try {
        for (;;) {
          const rows = await loadExportPage(input.memoryId, filters, cursor);
          const page = rows.map(toExportEntry);
          if (!wroteHeader) {
            controller.enqueue(
              encoder.encode(
                `${serializeTmxHeaderXml(
                  { creationtool: "Hyperlocalise" },
                  filters.sourceLocale ?? page[0]?.sourceLocale,
                )}\n`,
              ),
            );
            wroteHeader = true;
          }
          if (page.length === 0) {
            break;
          }
          const combined = [...pending, ...page];
          const split =
            rows.length === TMX_EXPORT_PAGE_SIZE
              ? trailingTuidGroup(combined)
              : { flush: combined, pending: [] as TmxExportEntry[] };
          pending = split.pending;
          if (split.flush.length > 0) {
            const unitsXml = serializeTmxUnitsXml(groupEntriesForTmxExport(split.flush));
            if (unitsXml) {
              controller.enqueue(encoder.encode(`${unitsXml}\n`));
            }
          }
          const last = rows.at(-1);
          if (!last || rows.length < TMX_EXPORT_PAGE_SIZE) {
            break;
          }
          cursor = { createdAt: last.createdAt, id: last.id };
        }
        if (pending.length > 0) {
          const unitsXml = serializeTmxUnitsXml(groupEntriesForTmxExport(pending));
          if (unitsXml) {
            controller.enqueue(encoder.encode(`${unitsXml}\n`));
          }
        }
        controller.enqueue(encoder.encode(serializeTmxFooterXml()));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export async function exportMemoryEntriesTmx(input: {
  memoryId: string;
  memoryName: string;
  filters?: MemoryExportFilters;
}) {
  const filters = input.filters ?? {};
  return {
    body: createMemoryTmxExportStream({
      memoryId: input.memoryId,
      filters,
    }),
    filename: buildMemoryTmxFilename(input.memoryName, filters),
  };
}
