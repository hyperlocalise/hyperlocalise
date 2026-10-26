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
import { sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import type { CompletionSource } from "./report-units";

type Provenance = (typeof schema.projectTranslationRevisions.$inferSelect)["provenance"];

/** Where a translation's text came from, from how the editor says it was written. */
export function sourceOfProvenance(provenance: Provenance): CompletionSource {
  switch (provenance) {
    case "manual":
      return "person";
    case "import":
      return "import";
    case "translation_job":
    case "agent":
      return "ai";
  }
}

export type TextOrigin = {
  /** Where the text a person was given came from. */
  source: CompletionSource;
  /** Whether the text now saved is that text, untouched. */
  unchanged: boolean;
};

/** A person's save of a translation, as the editor's own history can place it. */
export type SavedText = {
  translationId: string;
  /** The saved version, when the save names it (the Go service's text saves do). */
  revisionId?: string;
  /** When the save was made: the latest version by then is the saved one when none is named. */
  at?: Date;
  /** The text saved, for a translation with no history to read it from. */
  text: string;
};

/**
 * For each save, what the person was given and whether they changed it: the version they saved
 * (named by the save, else the latest at the save's time, else the text given here) against the
 * latest version up to it not written by a person (a task's output, an import). Read from the
 * editor's history rather than the translation now, which a job may have overwritten since the
 * save. A translation with no such version was written by a person from nothing. Results are in
 * the order of `saves`.
 */
export async function textOrigins(
  organizationId: string,
  saves: SavedText[],
): Promise<TextOrigin[]> {
  if (saves.length === 0) return [];
  const column = (values: (string | null)[], type: string) =>
    sql`${`{${values.map((value) => (value === null ? "NULL" : `"${value}"`)).join(",")}}`}::${sql.raw(type)}[]`;
  const result = await db.execute<{
    position: number;
    savedText: string | null;
    givenText: string | null;
    givenProvenance: Provenance | null;
  }>(sql`
    with saves as (
      select translation_id, revision_id, at, position
      from unnest(
        ${column(
          saves.map((save) => save.translationId),
          "uuid",
        )},
        ${column(
          saves.map((save) => save.revisionId ?? null),
          "uuid",
        )},
        ${column(
          saves.map((save) => save.at?.toISOString() ?? null),
          "timestamptz",
        )}
      ) with ordinality as s(translation_id, revision_id, at, position)
    )
    select s.position::integer, saved.text as "savedText", given.text as "givenText",
      given.provenance as "givenProvenance"
    from saves s
    left join lateral (
      select r.id, r.text, r.created_at from project_translation_revisions r
      where r.organization_id = ${organizationId} and r.translation_id = s.translation_id
        and case when s.revision_id is not null then r.id = s.revision_id
          else s.at is null or r.created_at <= s.at end
      order by r.created_at desc, r.id desc limit 1
    ) saved on true
    left join lateral (
      select r.text, r.provenance from project_translation_revisions r
      where r.organization_id = ${organizationId} and r.translation_id = s.translation_id
        and r.actor_kind <> 'user'
        -- The saved version itself, when a person saved without a change of their own.
        and (saved.id is null or (r.created_at, r.id) <= (saved.created_at, saved.id))
      order by r.created_at desc, r.id desc limit 1
    ) given on true
    order by s.position
  `);
  return result.rows.map((row, index) => {
    const saved = row.savedText ?? saves[index].text;
    return row.givenProvenance
      ? { source: sourceOfProvenance(row.givenProvenance), unchanged: row.givenText === saved }
      : { source: "person", unchanged: false };
  });
}

/** What a person's save records: the given text's source if they kept it, else their own work. */
export function personSave(origin: TextOrigin | undefined): {
  source: CompletionSource;
  unchanged: boolean;
} {
  if (!origin) return { source: "person", unchanged: false };
  return origin.unchanged ? origin : { source: "person", unchanged: false };
}
