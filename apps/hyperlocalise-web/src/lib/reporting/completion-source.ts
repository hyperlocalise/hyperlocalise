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

import type { TranslationOrigin } from "@/lib/projects/translations/translation-origin-rule";

import { postEditScore } from "./memory-match-index";
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
  /**
   * How close the saved text is to the text the person was given (`postEditScore`): null when
   * they were given none, or it could not be scored.
   */
  postEditScore?: number | null;
};

/** A person's save of a translation, as the editor's own history can place it. */
export type SavedText = {
  translationId: string;
  /** The saved version, when the save names it (the Go service's text saves do). */
  revisionId?: string;
  /** When the save was made: the latest version by then is the saved one when none is named. */
  at?: Date;
  /** Who saved: the text they were given is the latest version before theirs written by someone else. */
  actorUserId?: string | null;
};

/**
 * For each save, what the person was given and whether they changed it, read from the saved
 * version's origin (named by the save, else the latest version by the save's time), which writers
 * work out by the same comparison: `machine` is machine text kept as is, `unknown` imported text
 * kept as is, and anything else the person's own work. Read from the editor's history rather than
 * the translation now, which a job may have overwritten since the save. A save with no version is
 * the person's own work. Results are in the order of `saves`.
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
    origin: TranslationOrigin | null;
    savedText: string | null;
    givenText: string | null;
  }>(sql`
    with saves as (
      select translation_id, revision_id, at, actor_user_id, position
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
        )},
        ${column(
          saves.map((save) => save.actorUserId ?? null),
          "uuid",
        )}
      ) with ordinality as s(translation_id, revision_id, at, actor_user_id, position)
    )
    select s.position::integer, saved.origin::text as origin, saved.text as "savedText",
      -- A save whose version someone else wrote (an approval of the text as given) kept it.
      case when s.actor_user_id is not null and saved.actor_user_id is distinct from s.actor_user_id
        then saved.text else given.text end as "givenText"
    from saves s
    left join lateral (
      select r.id, r.origin, r.text, r.created_at, r.actor_user_id
      from project_translation_revisions r
      where r.organization_id = ${organizationId} and r.translation_id = s.translation_id
        -- The save's time arrives cut to the millisecond, while a revision's has microseconds:
        -- compared whole, a revision written in the save's own millisecond would look later.
        and case when s.revision_id is not null then r.id = s.revision_id
          else s.at is null or date_trunc('milliseconds', r.created_at) <= s.at end
      order by r.created_at desc, r.id desc limit 1
    ) saved on true
    -- What the person was given: the latest version before the saved one that someone else (or
    -- a job, an agent, an import) wrote. A reviewer is given the translator's text, not the AI's.
    left join lateral (
      select r.text from project_translation_revisions r
      where s.actor_user_id is not null and saved.id is not null
        and r.organization_id = ${organizationId} and r.translation_id = s.translation_id
        and (r.created_at, r.id) < (saved.created_at, saved.id)
        and r.actor_user_id is distinct from s.actor_user_id
      order by r.created_at desc, r.id desc limit 1
    ) given on true
    order by s.position
  `);
  return result.rows.map((row) => ({
    ...sourceOfOrigin(row.origin),
    postEditScore:
      row.givenText !== null && row.savedText !== null
        ? postEditScore(row.givenText, row.savedText)
        : null,
  }));
}

/** What a saved version's origin says the person was given, and whether they kept it. */
export function sourceOfOrigin(origin: TranslationOrigin | null): TextOrigin {
  switch (origin) {
    case "machine":
      return { source: "ai", unchanged: true };
    case "unknown":
      return { source: "import", unchanged: true };
    case "machine_post_edited":
    case "human":
    case null:
      return { source: "person", unchanged: false };
  }
}

/** What a person's save records: the given text's source if they kept it, else their own work. */
export function personSave(origin: TextOrigin | undefined): {
  source: CompletionSource;
  unchanged: boolean;
  postEditScore: number | null;
} {
  if (!origin) return { source: "person", unchanged: false, postEditScore: null };
  const postEditScore = origin.postEditScore ?? null;
  return origin.unchanged
    ? { source: origin.source, unchanged: true, postEditScore }
    : { source: "person", unchanged: false, postEditScore };
}
