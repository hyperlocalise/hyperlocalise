import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import { toTranslationMemoryRecord } from "@/lib/translation-memory/memory-records";

import {
  listTranslationMemoryQuerySchema,
  type ListTranslationMemoryQuery,
} from "./translation-memory.schema";

const validateListTranslationMemoryQuery = validator("query", (value, _c) => {
  const parsed = listTranslationMemoryQuerySchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  return parsed.data;
});

export function createTranslationMemoryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateListTranslationMemoryQuery, async (c) => {
      const query: ListTranslationMemoryQuery | undefined = c.req.valid("query");
      const limit = query?.limit ?? 50;
      const offset = query?.offset ?? 0;

      const memories = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.organizationId, c.var.auth.organization.localOrganizationId))
        .orderBy(desc(schema.memories.createdAt))
        .limit(limit)
        .offset(offset);

      return c.json({ translationMemories: memories.map(toTranslationMemoryRecord) }, 200);
    });
}
