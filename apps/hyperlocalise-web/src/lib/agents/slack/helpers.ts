import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export async function findSlackConnector(teamId: string) {
  const [connector] = await db
    .select()
    .from(schema.connectors)
    .where(
      and(
        eq(schema.connectors.kind, "slack"),
        sql`${schema.connectors.config}->>'teamId' = ${teamId}`,
      ),
    )
    .limit(1);

  return connector ?? null;
}
