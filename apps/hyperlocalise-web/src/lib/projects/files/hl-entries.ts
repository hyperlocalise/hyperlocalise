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
import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";

export type HlEntryRecord = {
  text: string;
  maxLength?: number;
  context?: string | null;
};

export type HlEntriesPayload = Record<string, string | HlEntryRecord>;

function isHlEntryRecord(value: unknown): value is HlEntryRecord {
  if (!value || typeof value !== "object" || !("text" in value)) {
    return false;
  }
  const record = value as HlEntryRecord;
  return typeof record.text === "string";
}

export function hlEntriesPayloadToStringMap(payload: HlEntriesPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = typeof value === "string" ? value : value.text;
  }
  return out;
}

export function entriesFromHlOutput(payload: HlEntriesPayload): ProjectSourceStringEntry[] {
  return Object.entries(payload)
    .map(([key, value]) => {
      const text = typeof value === "string" ? value : value.text;
      const maxLength =
        typeof value === "string"
          ? undefined
          : value.maxLength != null && value.maxLength > 0
            ? Math.trunc(value.maxLength)
            : undefined;

      return {
        key: key.trim(),
        text,
        context: typeof value === "string" ? null : (value.context ?? null),
        type: "string" as const,
        ...(maxLength !== undefined ? { maxLength } : {}),
      };
    })
    .filter((entry) => entry.key.length > 0 && entry.text.trim().length > 0);
}

export function parseHlEntriesJson(raw: unknown): HlEntriesPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("hl entries output must be a JSON object");
  }

  const payload: HlEntriesPayload = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      payload[key] = value;
      continue;
    }
    if (isHlEntryRecord(value)) {
      payload[key] = value;
      continue;
    }
    throw new Error(`hl entries output for key ${JSON.stringify(key)} must be a string or object`);
  }
  return payload;
}
