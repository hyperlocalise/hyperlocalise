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
import { and, eq, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { usdUnits } from "./money";
import type { RateBasis, ReportStep } from "./report-units";
import { MATCH_BUCKETS, type MatchBucket } from "./word-analysis";

/**
 * Rate cards: named sets of rate lines, one per language pair and step. Lines are versioned rows
 * in `reporting_rates`: saving a card adds a row for each line that changed and a retired row
 * for each line taken off, so work recorded earlier keeps the rate it was recorded at.
 */

export type BandPercentages = Partial<Record<MatchBucket, number>>;

export type RateLine = {
  id: string;
  sourceLocale: string;
  targetLocale: string;
  step: ReportStep;
  basis: RateBasis;
  rate: string;
  percentages: BandPercentages;
};

export type RateCard = { name: string; defaultBasis: RateBasis; lines: RateLine[] };

/** The newest row of every card, language pair and step, retired ones included. */
export function liveRateRows(organizationId: string) {
  return sql`
    select distinct on (name, source_locale, target_locale, step)
      id, name, source_locale, target_locale, step, basis, rate, percentages, retired
    from reporting_rates where organization_id = ${organizationId}
    order by name, source_locale, target_locale, step, created_at desc, id desc`;
}

type LiveRow = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocale: string;
  step: ReportStep;
  basis: RateBasis;
  rate: string;
  percentages: BandPercentages;
  retired: boolean;
};

async function liveRows(organizationId: string, database: DatabaseClient, name?: string) {
  const result = await database.execute<LiveRow>(sql`
    select id, name, source_locale as "sourceLocale", target_locale as "targetLocale", step, basis,
      rate::text as rate, percentages, retired
    from (${liveRateRows(organizationId)}) live
    ${name === undefined ? sql`` : sql`where name = ${name}`}
    order by name, source_locale, target_locale, step
  `);
  return result.rows;
}

/** Every rate card with its current lines, by name. */
export async function listRateCards(
  organizationId: string,
  database: DatabaseClient = db,
): Promise<RateCard[]> {
  const [cards, rows] = await Promise.all([
    database
      .select()
      .from(schema.reportingRateCards)
      .where(eq(schema.reportingRateCards.organizationId, organizationId)),
    liveRows(organizationId, database),
  ]);
  const byName = new Map<string, RateCard>();
  for (const card of cards)
    byName.set(card.name, { name: card.name, defaultBasis: card.defaultBasis, lines: [] });
  for (const row of rows) {
    if (row.retired) continue;
    let card = byName.get(row.name);
    // Cards made before cards had their own record start with per-word lines.
    if (!card) {
      card = { name: row.name, defaultBasis: "word", lines: [] };
      byName.set(row.name, card);
    }
    card.lines.push(lineOf(row));
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function lineOf(row: LiveRow): RateLine {
  return {
    id: row.id,
    sourceLocale: row.sourceLocale,
    targetLocale: row.targetLocale,
    step: row.step,
    basis: row.basis,
    rate: row.rate,
    percentages: row.percentages,
  };
}

/** True when a card of this name has a record or any rate line. */
export async function rateCardExists(
  organizationId: string,
  name: string,
  database: DatabaseClient = db,
): Promise<boolean> {
  const result = await database.execute<{ found: boolean }>(sql`
    select exists(
      select 1 from reporting_rate_cards where organization_id = ${organizationId} and name = ${name}
    ) or exists(
      select 1 from reporting_rates where organization_id = ${organizationId} and name = ${name}
    ) as found
  `);
  return result.rows[0].found;
}

/** True when a rate row is its line's newest version and not retired, so a task may use it. */
export async function isLiveRateLine(
  organizationId: string,
  rateId: string,
  database: DatabaseClient = db,
): Promise<boolean> {
  const result = await database.execute<{ found: boolean }>(sql`
    select exists(
      select 1 from (${liveRateRows(organizationId)}) live where id = ${rateId} and not retired
    ) as found
  `);
  return result.rows[0].found;
}

export type RateLineInput = Omit<RateLine, "id">;

export type SaveRateCardError =
  | { code: "rate_card_exists" }
  | { code: "rate_card_not_found" }
  | { code: "duplicate_rate_line"; line: Pick<RateLine, "sourceLocale" | "targetLocale" | "step"> };

const lineKey = (line: Pick<RateLine, "sourceLocale" | "targetLocale" | "step">) =>
  `${line.sourceLocale}\u0000${line.targetLocale}\u0000${line.step}`;

/** Percentages compared by value: a band left out is paid at 100%. */
function samePercentages(left: BandPercentages, right: BandPercentages) {
  return MATCH_BUCKETS.every((bucket) => (left[bucket] ?? 100) === (right[bucket] ?? 100));
}

/**
 * Saves a rate card's default basis and its whole set of lines. `create` makes a new card and
 * fails if the name is taken; otherwise the card must exist. Only changed lines get a new row.
 */
export async function saveRateCard(input: {
  organizationId: string;
  actorId: string;
  name: string;
  defaultBasis: RateBasis;
  lines: RateLineInput[];
  create: boolean;
}): Promise<Result<RateCard, SaveRateCardError>> {
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(lineKey(line)))
      return err({
        code: "duplicate_rate_line",
        line: { sourceLocale: line.sourceLocale, targetLocale: line.targetLocale, step: line.step },
      });
    seen.add(lineKey(line));
  }
  return db.transaction(async (tx) => {
    // Two saves of one card would each add rows for the other's lines.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`reporting-rate-card:${input.organizationId}:${input.name}`}))`,
    );
    const exists = await rateCardExists(input.organizationId, input.name, tx);
    if (input.create && exists)
      return err<RateCard, SaveRateCardError>({ code: "rate_card_exists" });
    if (!input.create && !exists)
      return err<RateCard, SaveRateCardError>({ code: "rate_card_not_found" });
    const before = (await liveRows(input.organizationId, tx, input.name)).filter(
      (row) => !row.retired,
    );
    const [card] = await tx
      .select()
      .from(schema.reportingRateCards)
      .where(
        and(
          eq(schema.reportingRateCards.organizationId, input.organizationId),
          eq(schema.reportingRateCards.name, input.name),
        ),
      );
    const [saved] = await tx
      .insert(schema.reportingRateCards)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        defaultBasis: input.defaultBasis,
      })
      .onConflictDoUpdate({
        target: [schema.reportingRateCards.organizationId, schema.reportingRateCards.name],
        set: { defaultBasis: input.defaultBasis },
      })
      .returning();
    const current = new Map(before.map((row) => [lineKey(row), row]));
    const changed = input.lines.filter((line) => {
      const row = current.get(lineKey(line));
      return (
        !row ||
        row.basis !== line.basis ||
        usdUnits(row.rate) !== usdUnits(line.rate) ||
        !samePercentages(row.percentages, line.percentages)
      );
    });
    const removed = before.filter((row) => !seen.has(lineKey(row)));
    const rows = [
      ...changed.map((line) => ({ ...line, retired: false })),
      ...removed.map((row) => ({ ...lineOf(row), id: undefined, retired: true })),
    ];
    if (rows.length)
      await tx.insert(schema.reportingRates).values(
        rows.map((row) => ({
          organizationId: input.organizationId,
          name: input.name,
          sourceLocale: row.sourceLocale,
          targetLocale: row.targetLocale,
          step: row.step,
          basis: row.basis,
          rate: row.rate,
          percentages: row.percentages,
          retired: row.retired,
          // After the lock, so a save that waited for another is always the newer version.
          createdAt: sql`clock_timestamp()`,
        })),
      );
    await tx.insert(schema.reportingAudit).values({
      organizationId: input.organizationId,
      actorId: input.actorId,
      resourceId: saved.id,
      action: input.create ? "rate_card_created" : "rate_card_saved",
      before: exists
        ? { defaultBasis: card?.defaultBasis ?? "word", lines: before.map(lineOf) }
        : null,
      after: { defaultBasis: input.defaultBasis, lines: input.lines },
    });
    const lines = (await liveRows(input.organizationId, tx, input.name))
      .filter((row) => !row.retired)
      .map(lineOf);
    return ok<RateCard, SaveRateCardError>({
      name: input.name,
      defaultBasis: input.defaultBasis,
      lines,
    });
  });
}
