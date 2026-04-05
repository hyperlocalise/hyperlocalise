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

export { db, schema };
