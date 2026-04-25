import { eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

export async function lookupUserByEmail(email: string) {
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()))
    .limit(1);

  return user ?? null;
}
