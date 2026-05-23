import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Glossary } from "@/lib/database/types";
import { toGlossaryRecord } from "@/lib/glossary/glossary-records";
import {
  listGlossaryTermsByGlossaryId,
  listWorkspaceGlossaryTerms,
} from "@/lib/glossary/query-glossary-terms";

import {
  createGlossaryBodySchema,
  glossaryIdParamsSchema,
  listGlossaryQuerySchema,
  listWorkspaceGlossaryTermsQuerySchema,
  updateGlossaryBodySchema,
  type CreateGlossaryBody,
  type ListGlossaryQuery,
  type ListWorkspaceGlossaryTermsQuery,
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
  list(auth: ApiAuthContext, query?: ListGlossaryQuery): Promise<Glossary[]>;
  create(auth: ApiAuthContext, payload: CreateGlossaryBody): Promise<Glossary>;
  getById(auth: ApiAuthContext, glossaryId: string): Promise<Glossary | null>;
  update(
    auth: ApiAuthContext,
    glossaryId: string,
    payload: UpdateGlossaryBody,
  ): Promise<Glossary | null>;
  delete(auth: ApiAuthContext, glossaryId: string): Promise<boolean>;
};

const glossaryStore: GlossaryStore = {
  async list(auth, query) {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    return db
      .select()
      .from(schema.glossaries)
      .where(eq(schema.glossaries.organizationId, auth.organization.localOrganizationId))
      .orderBy(desc(schema.glossaries.createdAt))
      .limit(limit)
      .offset(offset);
  },
  async create(auth, payload) {
    const [glossary] = await db
      .insert(schema.glossaries)
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
      .from(schema.glossaries)
      .where(ownedGlossaryWhere(auth, glossaryId))
      .limit(1);

    return glossary ?? null;
  },
  async update(auth, glossaryId, payload) {
    const [glossary] = await db
      .update(schema.glossaries)
      .set(payload)
      .where(ownedGlossaryWhere(auth, glossaryId))
      .returning();

    return glossary ?? null;
  },
  async delete(auth, glossaryId) {
    const deletedGlossaries = await db
      .delete(schema.glossaries)
      .where(ownedGlossaryWhere(auth, glossaryId))
      .returning({ id: schema.glossaries.id });

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

const validateListWorkspaceGlossaryTermsQuery = validator("query", (value, _c) => {
  const parsed = listWorkspaceGlossaryTermsQuerySchema.safeParse(value);

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
      return c.json({ glossaries: glossaries.map(toGlossaryRecord) }, 200);
    })
    .get("/workspace-terms", validateListWorkspaceGlossaryTermsQuery, async (c) => {
      const query: ListWorkspaceGlossaryTermsQuery | undefined = c.req.valid("query");
      const glossaryTerms = await listWorkspaceGlossaryTerms({
        organizationId: c.var.auth.organization.localOrganizationId,
        limit: query?.limit,
      });

      return c.json({ glossaryTerms }, 200);
    })
    .post("/", validateCreateGlossaryBody, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const glossary = await glossaryStore.create(c.var.auth, payload);
      return c.json({ glossary: toGlossaryRecord(glossary) }, 201);
    })
    .get("/:glossaryId", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      return c.json({ glossary: toGlossaryRecord(glossary) }, 200);
    })
    .get("/:glossaryId/terms", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      const glossaryTerms = await listGlossaryTermsByGlossaryId({
        organizationId: c.var.auth.organization.localOrganizationId,
        glossaryId: params.glossaryId,
      });

      return c.json({ glossaryTerms }, 200);
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

      return c.json({ glossary: toGlossaryRecord(glossary) }, 200);
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
