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

import { db, type DatabaseClient } from "@/lib/database/client";

/**
 * Labels translations and revisions written before `origin` existed, a batch at a time so no
 * statement holds many row locks. Run once after deploying migration 0177
 * (`vp run translations:backfill-origin`); running it again changes nothing.
 *
 * Rows still at the column default (`unknown`) are relabelled from provenance and history, by
 * the rule writers follow (`translation-origin-rule.ts`): a job or agent wrote `machine`, an import
 * `unknown`, and a person's save (`manual`) is compared with the latest earlier write that was not
 * a person's: the same text keeps that write's origin, changed machine text is post-edited, and
 * anything else is the person's own. Imports are skipped since `unknown` is already their label.
 */
export async function backfillTranslationOrigins(
  options: { batchSize?: number; database?: DatabaseClient; signal?: AbortSignal } = {},
): Promise<{ revisions: number; translations: number }> {
  const database = options.database ?? db;
  const batchSize = options.batchSize ?? 2_000;
  const revisions = await backfillTable(database, batchSize, options.signal, revisionBatch);
  const translations = await backfillTable(database, batchSize, options.signal, translationBatch);
  return { revisions, translations };
}

type BatchResult = { lastId: string | null; count: number };

type BatchStatement = (after: string | null, batchSize: number) => SQL;

async function backfillTable(
  database: DatabaseClient,
  batchSize: number,
  signal: AbortSignal | undefined,
  batch: BatchStatement,
): Promise<number> {
  let after: string | null = null;
  let updated = 0;
  for (;;) {
    signal?.throwIfAborted();
    const result: { rows: BatchResult[] } = await database.execute<BatchResult>(
      batch(after, batchSize),
    );
    const row: BatchResult | undefined = result.rows[0];
    if (!row?.lastId) return updated;
    updated += Number(row.count);
    after = row.lastId;
  }
}

const originCase = (provenance: SQL, text: SQL) => sql`(case
  when ${provenance} in ('translation_job', 'agent') then 'machine'
  when g.provenance is null then 'human'
  when g.provenance in ('translation_job', 'agent') and g.text = ${text} then 'machine'
  when g.provenance in ('translation_job', 'agent') then 'machine_post_edited'
  when g.text = ${text} then 'unknown'
  else 'human' end)::project_translation_origin`;

const afterId = (after: string | null) => (after ? sql`and id > ${after}::uuid` : sql``);

const revisionBatch: BatchStatement = (after, batchSize) => sql`
  with picked as (
    select id from project_translation_revisions
    where origin = 'unknown' and provenance <> 'import' ${afterId(after)}
    order by id limit ${batchSize}
  ), labelled as (
    select r.id, ${originCase(sql`r.provenance`, sql`r.text`)} as origin
    from project_translation_revisions r
    join picked on picked.id = r.id
    left join lateral (
      select p.provenance, p.text from project_translation_revisions p
      where p.translation_id = r.translation_id and p.provenance <> 'manual'
        and (p.created_at, p.id) < (r.created_at, r.id)
      order by p.created_at desc, p.id desc limit 1
    ) g on true
  ), updated as (
    update project_translation_revisions r set origin = labelled.origin
    from labelled where r.id = labelled.id and labelled.origin <> 'unknown'
  )
  select (select max(id::text) from picked) as "lastId", (select count(*) from labelled where origin <> 'unknown')::integer as count`;

const translationBatch: BatchStatement = (after, batchSize) => sql`
  with picked as (
    select id from project_translations
    where origin = 'unknown' and provenance <> 'import' ${afterId(after)}
    order by id limit ${batchSize}
  ), labelled as (
    select t.id, ${originCase(sql`t.provenance`, sql`t.text`)} as origin
    from project_translations t
    join picked on picked.id = t.id
    left join lateral (
      select p.provenance, p.text from project_translation_revisions p
      where p.translation_id = t.id and p.provenance <> 'manual'
      order by p.created_at desc, p.id desc limit 1
    ) g on true
  ), updated as (
    update project_translations t set origin = labelled.origin
    from labelled where t.id = labelled.id and labelled.origin <> 'unknown'
  )
  select (select max(id::text) from picked) as "lastId", (select count(*) from labelled where origin <> 'unknown')::integer as count`;
