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
import { schema } from "@/lib/database/client";

/**
 * Stand-in for `@/lib/job-change-events/job-writes` in unit tests whose database is a fake that
 * only knows the drizzle builder chain. It runs that chain as the code did before job change
 * events, so those fakes keep working; `job-writes.test.ts` covers the real helper against
 * Postgres. Use it with
 * `vi.mock("@/lib/job-change-events/job-writes", () => import("@/test/mocks/job-writes-passthrough"))`.
 */

// oxlint-disable-next-line typescript/no-explicit-any -- fakes implement a loose builder shape.
type FakeDatabase = any;

export async function updateJobs(
  database: FakeDatabase,
  input: { set: unknown; where: unknown; returning?: unknown },
) {
  const query = database.update(schema.jobs).set(input.set).where(input.where);
  return input.returning ? query.returning(input.returning) : query;
}

export async function insertJobs(
  database: FakeDatabase,
  input: {
    values: unknown;
    onConflict?: { action: "doNothing" } | { action: "doUpdate"; set: unknown };
    returning?: unknown;
  },
) {
  let query = database.insert(schema.jobs).values(input.values);
  if (input.onConflict?.action === "doNothing") {
    query = query.onConflictDoNothing({ target: schema.jobs.id });
  } else if (input.onConflict?.action === "doUpdate") {
    query = query.onConflictDoUpdate({ target: schema.jobs.id, set: input.onConflict.set });
  }
  if (input.returning === "all") {
    return query.returning();
  }
  return input.returning ? query.returning(input.returning) : query;
}
