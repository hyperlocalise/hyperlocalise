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
import { isErr } from "@/lib/primitives/result/results";

/**
 * A language file built from the source file's own shape: the source JSON is walked the way
 * the JSON importer flattens it (`a.b` for objects, `a[0]` for arrays), each string leaf takes
 * its approved translation, keeps what the repository's language file already had, or is left
 * out. Containers left empty are dropped. Indentation follows the source file.
 *
 * An array with a leaf that has neither is held back whole, because leaving one item out
 * would shift the others' keys on the next import. A FormatJS catalog (`{ key: { defaultMessage } }`)
 * keeps each message's other fields and swaps `defaultMessage`.
 */
export function buildContentSyncJsonTranslationFile(input: {
  source: Buffer;
  /** The repository's current language file, when it has one. */
  existing: Buffer | null;
  /** Flattened key to approved translation. */
  approved: Record<string, string>;
}): Buffer | null {
  const source = parseObject(input.source);
  if (!source) {
    return null;
  }
  const existing = input.existing ? parseObject(input.existing) : null;
  const tree = isFormatJsCatalog(source)
    ? buildCatalog(source, existing, input.approved)
    : buildObject(source, existing, "", input.approved);
  if (tree === undefined) {
    return null;
  }
  const indent = detectIndent(input.source.toString("utf8"));
  return Buffer.from(`${JSON.stringify(tree, null, indent)}\n`, "utf8");
}

type JsonObject = Record<string, unknown>;

function parseObject(bytes: Buffer): JsonObject | null {
  const parsed = safeJsonParse(bytes.toString("utf8"));
  if (isErr(parsed)) {
    return null;
  }
  const value: unknown = parsed.value;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function isFormatJsCatalog(payload: JsonObject): boolean {
  const entries = Object.values(payload);
  return (
    entries.length > 0 &&
    entries.every(
      (value) =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as { defaultMessage?: unknown }).defaultMessage === "string",
    )
  );
}

function buildCatalog(
  source: JsonObject,
  existing: JsonObject | null,
  approved: Record<string, string>,
): JsonObject | undefined {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    const message = value as JsonObject;
    const text = approved[key] ?? existingCatalogMessage(existing, key);
    if (text === undefined) {
      continue;
    }
    out[key] = { ...message, defaultMessage: text };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function existingCatalogMessage(existing: JsonObject | null, key: string): string | undefined {
  const entry = existing?.[key];
  const text =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as { defaultMessage?: unknown }).defaultMessage
      : undefined;
  return typeof text === "string" ? text : undefined;
}

function buildObject(
  source: JsonObject,
  existing: unknown,
  prefix: string,
  approved: Record<string, string>,
): JsonObject | undefined {
  const existingObject =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as JsonObject)
      : null;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    const built = buildValue(value, existingObject?.[key], flatKey, approved);
    if (built !== undefined) {
      out[key] = built;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildArray(
  source: unknown[],
  existing: unknown,
  prefix: string,
  approved: Record<string, string>,
): unknown[] | undefined {
  const existingArray = Array.isArray(existing) ? existing : null;
  const out: unknown[] = [];
  for (const [index, item] of source.entries()) {
    const built = buildValue(item, existingArray?.[index], `${prefix}[${index}]`, approved);
    if (built === undefined) {
      // One missing item would shift the rest, so the whole list waits.
      return undefined;
    }
    out.push(built);
  }
  return out.length > 0 ? out : undefined;
}

function buildValue(
  value: unknown,
  existing: unknown,
  flatKey: string,
  approved: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    const translated = approved[flatKey];
    if (translated !== undefined) {
      return translated;
    }
    return typeof existing === "string" ? existing : undefined;
  }
  if (Array.isArray(value)) {
    return buildArray(value, existing, flatKey, approved);
  }
  if (value && typeof value === "object") {
    return buildObject(value as JsonObject, existing, flatKey, approved);
  }
  // Numbers, booleans and null are not text; they travel with the structure.
  return value;
}

function detectIndent(text: string): string | number {
  const match = /\n([ \t]+)"/.exec(text);
  if (!match) {
    return 2;
  }
  return match[1]!.startsWith("\t") ? "\t" : match[1]!.length;
}
