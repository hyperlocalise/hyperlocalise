import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";

import {
  createGlossaryBodySchema,
  glossaryIdParamsSchema,
  listGlossaryQuerySchema,
  updateGlossaryBodySchema,
  type CreateGlossaryBody,
  type ListGlossaryQuery,
  type UpdateGlossaryBody,
} from "./glossary.schema";
import {
  forbiddenResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryMutationAllowed,
  ownedGlossaryWhere,
  glossaryNotFoundResponse,
} from "./glossary.shared";

type GlossaryStore = {
  list(auth: ApiAuthContext, query?: ListGlossaryQuery): Promise<unknown>;
  create(auth: ApiAuthContext, payload: CreateGlossaryBody): Promise<unknown>;
  getById(auth: ApiAuthContext, glossaryId: string): Promise<unknown>;
  update(auth: ApiAuthContext, glossaryId: string, payload: UpdateGlossaryBody): Promise<unknown>;
  delete(auth: ApiAuthContext, glossaryId: string): Promise<boolean>;
};

const glossaryStore: GlossaryStore = {
  async list(auth, query) {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    return db
      .select()
      .from(schema.translationGlossaries)
      .where(eq(schema.translationGlossaries.organizationId, auth.organization.localOrganizationId))
      .orderBy(desc(schema.translationGlossaries.createdAt))
      .limit(limit)
      .offset(offset);
  },
  async create(auth, payload) {
    const [glossary] = await db
      .insert(schema.translationGlossaries)
      .values({
        organizationId: auth.organization.localOrganizationId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description ?? "",
        sourceLocale: payload.sourceLocale,
        targetLocale: payload.targetLocale,
      })
      .returning();

    return glossary;
  },
  async getById(auth, glossaryId) {
    const [glossary] = await db
      .select()
      .from(schema.translationGlossaries)
      .where(ownedGlossaryWhere(auth, glossaryId))
      .limit(1);

    return glossary ?? null;
  },
  async update(auth, glossaryId, payload) {
    const [glossary] = await db
      .update(schema.translationGlossaries)
      .set(payload)
      .where(ownedGlossaryWhere(auth, glossaryId))
      .returning();

    return glossary ?? null;
  },
  async delete(auth, glossaryId) {
    const deletedGlossaries = await db
      .delete(schema.translationGlossaries)
      .where(ownedGlossaryWhere(auth, glossaryId))
      .returning({ id: schema.translationGlossaries.id });

    return deletedGlossaries.length > 0;
  },
};

const validateGlossaryParams = validator("param", (value, c) => {
  const parsed = glossaryIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return glossaryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateCreateGlossaryBody = validator("json", (value, c) => {
  const parsed = createGlossaryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidGlossaryPayloadResponse(c);
  }

  return parsed.data;
});

const validateUpdateGlossaryBody = validator("json", (value, c) => {
  const parsed = updateGlossaryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidGlossaryPayloadResponse(c);
  }

  return parsed.data;
});

const validateListGlossaryQuery = validator("query", (value, _c) => {
  const parsed = listGlossaryQuerySchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  return parsed.data;
});

export function createGlossaryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateListGlossaryQuery, async (c) => {
      const query = c.req.valid("query");
      const glossaries = await glossaryStore.list(c.var.auth, query);
      return c.json({ glossaries }, 200);
    })
    .post("/", validateCreateGlossaryBody, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const glossary = await glossaryStore.create(c.var.auth, payload);
      return c.json({ glossary }, 201);
    })
    .get("/:glossaryId", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      return c.json({ glossary }, 200);
    })
    .patch("/:glossaryId", validateGlossaryParams, validateUpdateGlossaryBody, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const glossary = await glossaryStore.update(c.var.auth, params.glossaryId, payload);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      return c.json({ glossary }, 200);
    })
    .delete("/:glossaryId", validateGlossaryParams, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const deleted = await glossaryStore.delete(c.var.auth, params.glossaryId);

      if (!deleted) {
        return glossaryNotFoundResponse(c);
      }

      return c.body(null, 204);
    });
}
