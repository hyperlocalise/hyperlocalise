import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "@/lib/env";
import * as schema from "@/lib/database/schema";

const db = drizzle(env.DATABASE_URL, { schema });

export { db, schema };
