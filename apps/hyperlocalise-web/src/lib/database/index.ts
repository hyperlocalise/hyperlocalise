/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "@/lib/env";
import * as schema from "@/lib/database/schema";

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

const db = globalForDb.db ?? drizzle(env.DATABASE_URL, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await db.$client.query("select 1");
    return true;
  } catch {
    return false;
  }
}

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DatabaseClient = typeof db | DatabaseTransaction;

export { db, schema };
