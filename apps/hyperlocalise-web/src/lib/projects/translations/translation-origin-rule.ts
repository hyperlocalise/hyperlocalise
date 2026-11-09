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
/**
 * Whether a machine or a person wrote a translation's text. Provenance names the last writer and
 * is overwritten by every save, so a person approving machine text unchanged would make it theirs;
 * origin follows the text instead. Keep in step with `internal/translationorigin` (Go) and the
 * backfill in `backfill-translation-origins.ts`. Safe to import from client code; the SQL forms
 * live in `translation-origin.ts`.
 */
export const translationOrigins = ["machine", "machine_post_edited", "human", "unknown"] as const;

export type TranslationOrigin = (typeof translationOrigins)[number];

/** Who is writing the text: a job or agent, a person, or an import that doesn't say. */
export type TranslationOriginWriter = "machine" | "person" | "import";

export function isTranslationOrigin(value: unknown): value is TranslationOrigin {
  return typeof value === "string" && (translationOrigins as readonly string[]).includes(value);
}

/**
 * The origin after `writer` writes `text` over `previous` (null when there was no translation).
 * Unchanged text keeps its origin, so approving changes nothing. A machine always writes machine
 * text. A person who changes machine text post-edits it; anything else a person writes is theirs.
 * An import that changes the text records it as unknown.
 */
export function nextTranslationOrigin(
  previous: { origin: TranslationOrigin; text: string } | null | undefined,
  writer: TranslationOriginWriter,
  text: string,
): TranslationOrigin {
  if (writer === "machine") return "machine";
  if (previous && previous.text === text) return previous.origin;
  if (writer === "import") return "unknown";
  if (previous && (previous.origin === "machine" || previous.origin === "machine_post_edited")) {
    return "machine_post_edited";
  }
  return "human";
}

/** The writer kind for a `project_translation_provenance` value. */
export function translationOriginWriterForProvenance(
  provenance: "manual" | "translation_job" | "import" | "agent",
): TranslationOriginWriter {
  switch (provenance) {
    case "translation_job":
    case "agent":
      return "machine";
    case "import":
      return "import";
    case "manual":
      return "person";
  }
}
