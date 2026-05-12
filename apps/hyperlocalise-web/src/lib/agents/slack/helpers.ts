import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export async function findSlackConnector(teamId: string, options: { enabledOnly?: boolean } = {}) {
  const conditions = [
    eq(schema.connectors.kind, "slack"),
    sql`${schema.connectors.config}->>'teamId' = ${teamId}`,
  ];
  if (options.enabledOnly ?? true) {
    conditions.push(eq(schema.connectors.enabled, true));
  }

  const [connector] = await db
    .select()
    .from(schema.connectors)
    .where(and(...conditions))
    .limit(1);

  return connector ?? null;
}
