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

export type JsonTranslationFileOutcome =
  | { kind: "file"; content: Buffer; listsHeldBack: number }
  /** Nothing approved differs from what the repository has, or there is nothing to send. */
  | { kind: "unchanged" }
  /** The source or the existing language file can't be read as JSON, or is a Lottie animation. */
  | { kind: "unreadable" }
  | { kind: "unsupported" };

/**
 * A language file built from the source file's own shape: the source JSON is walked the way
 * the JSON importer flattens it (`a.b` for objects, `a[0]` for arrays). Each string leaf takes
 * its approved translation, else what the repository's language file has, else, for a string
 * the importer never made a key of (a context field, an excluded path, an empty string), the
 * source value, else it is left out. Keys only the language file has (extra plural forms, say)
 * stay unless the sync hid them; numbers, booleans and nulls keep the language file's value.
 * Containers left empty are dropped. A list with a missing item waits whole, since leaving one
 * out would shift the others' keys. Indentation, byte-order mark and final newline follow the
 * existing file, else the source. A FormatJS catalog (`{ key: { defaultMessage } }`) keeps each
 * message's other fields and swaps `defaultMessage`; a simple `{ key: text }` language file is
 * read for its text.
 */
export function buildContentSyncJsonTranslationFile(input: {
  source: Buffer;
  /** The repository's current language file, when it has one. */
  existing: Buffer | null;
  /** Flattened key to approved translation. */
  approved: Record<string, string>;
  /** Flattened keys the importer made of this file; a source string outside them is copied. */
  knownKeys: Set<string>;
  /** Flattened keys the sync hid because the repository dropped them; never written back. */
  droppedKeys: Set<string>;
  /** Flattened keys someone hid by hand: not text to translate, so they keep the file's or the source's value. */
  hiddenKeys: Set<string>;
  /** For a Flutter ARB file, the code the file is named with, written to `@@locale`. */
  arbLocale?: string;
}): JsonTranslationFileOutcome {
  const sourceText = stripBom(input.source.toString("utf8"));
  const source = parseObject(sourceText.text);
  if (!source) {
    return { kind: "unreadable" };
  }
  if (isLottie(source)) {
    return { kind: "unsupported" };
  }
  const existingText = input.existing ? stripBom(input.existing.toString("utf8")) : null;
  const existing = existingText ? parseObject(existingText.text) : null;
  if (existingText && !existing) {
    return { kind: "unreadable" };
  }

  const catalog = isFormatJsCatalog(source);
  if (existing && catalog && Object.values(existing).some((value) => Array.isArray(value))) {
    // A compiled catalog (message ASTs) can't be rebuilt from text.
    return { kind: "unreadable" };
  }
  const existingFlat = existing ? flatten(existing, catalog) : {};

  const held = { lists: 0 };
  const tree = catalog
    ? buildCatalog(source, existing, input)
    : buildObject(source, existing, "", input, held);
  if (tree === undefined) {
    return { kind: "unchanged" };
  }
  if (input.arbLocale !== undefined && "@@locale" in tree) {
    tree["@@locale"] = input.arbLocale;
  }
  // A file goes only when an approved text lands in it where the file had something else; a
  // reformat alone, or approved text that a waiting list keeps out, is never sent.
  const builtFlat = flatten(tree, catalog);
  const differs = Object.entries(input.approved).some(
    ([key, text]) => builtFlat[key] === text && existingFlat[key] !== text,
  );
  if (!differs) {
    return { kind: "unchanged" };
  }
  const layout = existingText ?? sourceText;
  const newline = layout.text.includes("\r\n") ? "\r\n" : "\n";
  const text = `${JSON.stringify(tree, null, detectIndent(layout.text)).replace(/\n/g, newline)}${layout.finalNewline ? newline : ""}`;
  return {
    kind: "file",
    content: Buffer.from(`${layout.bom ? "﻿" : ""}${text}`, "utf8"),
    listsHeldBack: held.lists,
  };
}

type JsonObject = Record<string, unknown>;

function stripBom(text: string): { text: string; bom: boolean; finalNewline: boolean } {
  const bom = text.charCodeAt(0) === 0xfeff;
  return {
    text: bom ? text.slice(1) : text,
    bom,
    finalNewline: text.endsWith("\n"),
  };
}

function parseObject(text: string): JsonObject | null {
  const parsed = safeJsonParse(text);
  if (isErr(parsed)) {
    return null;
  }
  const value: unknown = parsed.value;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

/** A Lottie animation is JSON too, but its strings are layer text the importer keys apart. */
function isLottie(payload: JsonObject): boolean {
  return "v" in payload && Array.isArray(payload.layers);
}

/** Whether a source file's bytes are a Lottie animation rather than a language file. */
export function isContentSyncLottieFile(source: Buffer): boolean {
  const payload = parseObject(stripBom(source.toString("utf8")).text);
  return payload !== null && isLottie(payload);
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

/** The same walk as the importer's, so keys match what it stored. */
function flatten(payload: JsonObject, catalog: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  if (catalog) {
    for (const [key, value] of Object.entries(payload)) {
      const text = catalogMessage(value);
      if (text !== undefined) {
        out[key] = text;
      }
    }
    return out;
  }
  const walk = (value: unknown, prefix: string) => {
    if (typeof value === "string") {
      out[prefix] = value;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${prefix}[${index}]`));
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as JsonObject)) {
        walk(child, prefix ? `${prefix}.${key}` : key);
      }
    }
  };
  walk(payload, "");
  return out;
}

function catalogMessage(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return entry;
  }
  const text =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as { defaultMessage?: unknown }).defaultMessage
      : undefined;
  return typeof text === "string" ? text : undefined;
}

type BuildInput = {
  approved: Record<string, string>;
  knownKeys: Set<string>;
  droppedKeys: Set<string>;
  hiddenKeys: Set<string>;
};

function buildCatalog(
  source: JsonObject,
  existing: JsonObject | null,
  input: BuildInput,
): JsonObject | undefined {
  // A language file kept as `{ id: text }` stays in that shape; a catalog stays a catalog.
  const simple =
    existing !== null &&
    Object.keys(existing).length > 0 &&
    Object.values(existing).every((value) => typeof value === "string");
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    const message = value as JsonObject;
    const text =
      input.approved[key] ??
      catalogMessage(existing?.[key]) ??
      (input.knownKeys.has(key) && !input.hiddenKeys.has(key)
        ? undefined
        : (message.defaultMessage as string));
    if (text === undefined) {
      continue;
    }
    out[key] = simple ? text : { ...message, defaultMessage: text };
  }
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (!(key in source) && !input.droppedKeys.has(key)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** An existing-only value with any key the sync hid taken out; `undefined` when nothing is left. */
function withoutDropped(value: unknown, flatKey: string, dropped: Set<string>): unknown {
  if (dropped.has(flatKey)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    // One item taken out, or trimmed, would shift the rest, so a list goes whole or not at all.
    const kept = value.map((item, index) => withoutDropped(item, `${flatKey}[${index}]`, dropped));
    return kept.every((item, index) => item === value[index]) ? value : undefined;
  }
  if (value && typeof value === "object") {
    const out: JsonObject = {};
    let changed = false;
    for (const [key, child] of Object.entries(value as JsonObject)) {
      const kept = withoutDropped(child, flatKey ? `${flatKey}.${key}` : key, dropped);
      changed ||= kept !== child;
      if (kept !== undefined) {
        out[key] = kept;
      }
    }
    // The same object back when nothing in it was dropped, so a list holding it stays whole.
    return !changed ? value : Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

function buildObject(
  source: JsonObject,
  existing: unknown,
  prefix: string,
  input: BuildInput,
  held: { lists: number },
): JsonObject | undefined {
  const existingObject =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as JsonObject)
      : null;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    const built = buildValue(value, existingObject?.[key], flatKey, input, held);
    if (built !== undefined) {
      out[key] = built;
    }
  }
  // What only the language file has, such as a locale's extra plural forms, is theirs to keep,
  // less anything the sync hid because the repository dropped it.
  for (const [key, value] of Object.entries(existingObject ?? {})) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (!(key in source)) {
      const kept = withoutDropped(value, flatKey, input.droppedKeys);
      if (kept !== undefined) {
        out[key] = kept;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildArray(
  source: unknown[],
  existing: unknown,
  prefix: string,
  input: BuildInput,
  held: { lists: number },
): unknown[] | undefined {
  const existingArray = Array.isArray(existing) ? existing : null;
  const out: unknown[] = [];
  for (const [index, item] of source.entries()) {
    const built = buildValue(item, existingArray?.[index], `${prefix}[${index}]`, input, held);
    if (built === undefined) {
      // One missing item would shift the rest, so the whole list waits, as the file has it.
      held.lists += 1;
      return existingArray ?? undefined;
    }
    out.push(built);
  }
  return out.length > 0 ? out : undefined;
}

function buildValue(
  value: unknown,
  existing: unknown,
  flatKey: string,
  input: BuildInput,
  held: { lists: number },
): unknown {
  if (typeof value === "string") {
    if (input.droppedKeys.has(flatKey)) {
      return undefined;
    }
    const translated = input.approved[flatKey];
    if (translated !== undefined) {
      return translated;
    }
    if (typeof existing === "string") {
      return existing;
    }
    // The importer made no key of it (a context field, an excluded path, an empty string), or
    // someone hid it on purpose: not text to translate, so it travels as it is.
    return input.knownKeys.has(flatKey) && !input.hiddenKeys.has(flatKey) ? undefined : value;
  }
  if (Array.isArray(value)) {
    return buildArray(value, existing, flatKey, input, held);
  }
  if (value && typeof value === "object") {
    return buildObject(value as JsonObject, existing, flatKey, input, held);
  }
  // Numbers, booleans and null are settings, not text; the language file's own value stays.
  return existing !== undefined && typeof existing === typeof value && existing !== null
    ? existing
    : value;
}

function detectIndent(text: string): string | number {
  const match = /\n([ \t]+)"/.exec(text);
  if (!match) {
    return 2;
  }
  return match[1]!.startsWith("\t") ? "\t" : match[1]!.length;
}
