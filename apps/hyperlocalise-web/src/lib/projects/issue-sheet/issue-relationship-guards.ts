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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";

// ponytail: defensive bound only, not a real constraint — a single org's issue graph
// is never anywhere near this size. Guards against an unbounded loop, not a real case.
const MAX_CYCLE_CHECK_ITERATIONS = 10_000;

/**
 * Returns whether adding a `fromIssueId -> toIssueId` edge of the given kind would
 * close a cycle in the existing `kind`-edge graph. Callers pass the edge already
 * normalized to its stored direction (e.g. a `blocked_by` request becomes the
 * inverted `blocks` edge before this is called).
 *
 * `duplicate_of` has out-degree <= 1 per issue (enforced by a DB partial unique
 * index), so its graph is a set of disjoint chains — the same BFS handles it
 * without special-casing.
 */
export async function wouldCreateCycle(input: {
  database?: DatabaseClient;
  organizationId: string;
  kind: "blocks" | "duplicate_of";
  fromIssueId: string;
  toIssueId: string;
}): Promise<boolean> {
  const database = input.database ?? db;

  let frontier = new Set([input.toIssueId]);
  const visited = new Set<string>();
  let iterations = 0;

  while (frontier.size > 0) {
    if (frontier.has(input.fromIssueId)) {
      return true;
    }

    iterations += 1;
    if (iterations > MAX_CYCLE_CHECK_ITERATIONS) {
      return false;
    }

    for (const id of frontier) {
      visited.add(id);
    }

    const rows = await database
      .select({ relatedIssueId: schema.issueSheetRelationships.relatedIssueId })
      .from(schema.issueSheetRelationships)
      .where(
        and(
          eq(schema.issueSheetRelationships.organizationId, input.organizationId),
          eq(schema.issueSheetRelationships.kind, input.kind),
          inArray(schema.issueSheetRelationships.issueId, [...frontier]),
        ),
      );

    const nextFrontier = new Set<string>();
    for (const row of rows) {
      if (!visited.has(row.relatedIssueId)) {
        nextFrontier.add(row.relatedIssueId);
      }
    }
    frontier = nextFrontier;
  }

  return false;
}
