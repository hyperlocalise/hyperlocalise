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
import { type SQL, sql } from "drizzle-orm";

import type { TranslationOriginWriter } from "./translation-origin-rule";

/**
 * `nextTranslationOrigin` (see `translation-origin-rule.ts`) as SQL for an upsert's
 * `ON CONFLICT DO UPDATE SET`: the row being written holds the previous text and origin, and
 * `excluded.text` is the new text.
 */
export function translationOriginOnConflict(writer: TranslationOriginWriter): SQL {
  if (writer === "machine") return sql`'machine'::project_translation_origin`;
  const changed = writer === "import" ? sql`'unknown'` : sql`'human'`;
  const overMachine = writer === "import" ? sql`'unknown'` : sql`'machine_post_edited'`;
  return sql`(case
    when "project_translations"."text" = excluded."text" then "project_translations"."origin"::text
    when "project_translations"."origin" in ('machine', 'machine_post_edited') then ${overMachine}
    else ${changed} end)::project_translation_origin`;
}
