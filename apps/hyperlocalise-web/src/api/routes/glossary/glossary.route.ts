import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { conflictResponse } from "@/api/errors";
import { db, schema } from "@/lib/database";
import type { Glossary } from "@/lib/database/types";
import { toGlossaryRecord } from "@/lib/glossary/glossary-records";
import { listGlossaryTermsByGlossaryId } from "@/lib/glossary/query-glossary-terms";

import { getOwnedProject } from "../project/project.shared";
import { buildGlossaryListWhere } from "./glossary-list-filters";
import {
  attachGlossaryProjectBodySchema,
  createGlossaryBodySchema,
  createGlossaryTermBodySchema,
  glossaryIdParamsSchema,
  glossaryProjectParamsSchema,
  glossaryTermIdParamsSchema,
  importGlossaryTermsBodySchema,
  listGlossaryQuerySchema,
  updateGlossaryBodySchema,
  updateGlossaryTermBodySchema,
  type AttachGlossaryProjectBody,
  type CreateGlossaryBody,
  type CreateGlossaryTermBody,
  type ImportGlossaryTermsBody,
  type ListGlossaryQuery,
  type UpdateGlossaryBody,
} from "./glossary.schema";
import {
  externalTmsGlossaryImmutableResponse,
  forbiddenResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryMutationAllowed,
  getOwnedGlossary,
  glossaryNotFoundResponse,
  ownedGlossaryWhere,
} from "./glossary.shared";

type GlossaryListResult = {
  glossaries: Glossary[];
  total: number;
};

type GlossaryStore = {
  list(auth: ApiAuthContext, query?: ListGlossaryQuery): Promise<GlossaryListResult>;
  create(auth: ApiAuthContext, payload: CreateGlossaryBody): Promise<Glossary>;
  getById(auth: ApiAuthContext, glossaryId: string): Promise<Glossary | null>;
  update(
    auth: ApiAuthContext,
    glossaryId: string,
    payload: UpdateGlossaryBody,
  ): Promise<Glossary | null>;
  delete(auth: ApiAuthContext, glossaryId: string): Promise<boolean>;
};

type GlossaryTerm = typeof schema.glossaryTerms.$inferSelect;

type GlossaryTermRecord = {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string;
  description: string;
  partOfSpeech: string;
  forbidden: boolean;
  caseSensitive: boolean;
  provenance: string;
  externalKey: string | null;
  reviewStatus: string;
};

type GlossaryProjectRecord = {
  projectId: string;
  projectName: string;
  priority: number;
  sourceLocale: string | null;
  targetLocales: string[];
};

const glossaryStore: GlossaryStore = {
  async list(auth, query) {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    const where = await buildGlossaryListWhere(auth, query);

    const [glossaries, totalRow] = await Promise.all([
      db
        .select()
        .from(schema.glossaries)
        .where(where)
        .orderBy(desc(schema.glossaries.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(schema.glossaries).where(where),
    ]);

    return { glossaries, total: totalRow[0]?.value ?? 0 };
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
    return getOwnedGlossary(auth, glossaryId);
  },
  async update(auth, glossaryId, payload) {
    const [glossary] = await db
      .update(schema.glossaries)
      .set(payload)
      .where(await ownedGlossaryWhere(auth, glossaryId))
      .returning();

    return glossary ?? null;
  },
  async delete(auth, glossaryId) {
    const deletedGlossaries = await db
      .delete(schema.glossaries)
      .where(await ownedGlossaryWhere(auth, glossaryId))
      .returning({ id: schema.glossaries.id });

    return deletedGlossaries.length > 0;
  },
};

function toGlossaryTermRecord(term: GlossaryTerm, glossary: Glossary): GlossaryTermRecord {
  return {
    id: term.id,
    glossaryId: term.glossaryId,
    glossaryName: glossary.name,
    sourceTerm: term.sourceTerm,
    targetTerm: term.targetTerm,
    targetLocale: glossary.targetLocale,
    description: term.description,
    partOfSpeech: term.partOfSpeech,
    forbidden: term.forbidden,
    caseSensitive: term.caseSensitive,
    provenance: term.provenance,
    externalKey: term.externalKey,
    reviewStatus: term.reviewStatus,
  };
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseGlossaryImport(payload: ImportGlossaryTermsBody): CreateGlossaryTermBody[] {
  if (payload.format === "csv") {
    const rows = parseCsvRows(payload.content);
    const [first, ...rest] = rows;
    const hasHeader = first?.some((cell) => /source|target|term/i.test(cell)) ?? false;
    const dataRows = hasHeader ? rest : rows;

    return dataRows.flatMap((row) => {
      const [sourceTerm, targetTerm, description = "", partOfSpeech = ""] = row;
      return sourceTerm && targetTerm
        ? [
            {
              sourceTerm,
              targetTerm,
              description,
              partOfSpeech,
              caseSensitive: false,
              forbidden: false,
            },
          ]
        : [];
    });
  }

  const entries = [...payload.content.matchAll(/<termEntry\b[\s\S]*?<\/termEntry>/gi)];
  return entries.flatMap((entry) => {
    const terms = [...entry[0].matchAll(/<term\b[^>]*>([\s\S]*?)<\/term>/gi)].map((match) =>
      match[1]?.replace(/[<>]/g, "").trim(),
    );
    const [sourceTerm, targetTerm] = terms.filter(Boolean) as string[];
    return sourceTerm && targetTerm
      ? [
          {
            sourceTerm,
            targetTerm,
            description: "",
            partOfSpeech: "",
            caseSensitive: false,
            forbidden: false,
          },
        ]
      : [];
  });
}

async function createGlossaryTerm(
  glossary: Glossary,
  payload: CreateGlossaryTermBody,
): Promise<GlossaryTerm | null> {
  const duplicateCheck = payload.caseSensitive
    ? eq(schema.glossaryTerms.sourceTerm, payload.sourceTerm)
    : sql`lower(${schema.glossaryTerms.sourceTerm}) = lower(${payload.sourceTerm})`;

  const existing = await db
    .select({ id: schema.glossaryTerms.id })
    .from(schema.glossaryTerms)
    .where(and(eq(schema.glossaryTerms.glossaryId, glossary.id), duplicateCheck))
    .limit(1);

  if (existing.length > 0) {
    return null;
  }

  const [term] = await db
    .insert(schema.glossaryTerms)
    .values({
      glossaryId: glossary.id,
      sourceTerm: payload.sourceTerm,
      targetTerm: payload.targetTerm,
      description: payload.description ?? "",
      partOfSpeech: payload.partOfSpeech ?? "",
      caseSensitive: payload.caseSensitive,
      forbidden: payload.forbidden,
    })
    .onConflictDoNothing()
    .returning();

  return term ?? null;
}

async function listGlossaryProjects(
  auth: ApiAuthContext,
  glossaryId: string,
): Promise<GlossaryProjectRecord[]> {
  return db
    .select({
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      priority: schema.projectGlossaries.priority,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projectGlossaries)
    .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projectGlossaries.organizationId, auth.organization.localOrganizationId),
        eq(schema.projectGlossaries.glossaryId, glossaryId),
      ),
    )
    .orderBy(schema.projectGlossaries.priority, schema.projects.name);
}

const validateGlossaryParams = validator("param", (value, c) => {
  const parsed = glossaryIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return glossaryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateGlossaryTermParams = validator("param", (value, c) => {
  const parsed = glossaryTermIdParamsSchema.safeParse(value);

  if (!parsed.success) {
    return glossaryNotFoundResponse(c);
  }

  return parsed.data;
});

const validateGlossaryProjectParams = validator("param", (value, c) => {
  const parsed = glossaryProjectParamsSchema.safeParse(value);

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

const validateCreateGlossaryTermBody = validator("json", (value, c) => {
  const parsed = createGlossaryTermBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidGlossaryPayloadResponse(c);
  }

  return parsed.data;
});

const validateUpdateGlossaryTermBody = validator("json", (value, c) => {
  const parsed = updateGlossaryTermBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidGlossaryPayloadResponse(c);
  }

  return parsed.data;
});

const validateImportGlossaryTermsBody = validator("json", (value, c) => {
  const parsed = importGlossaryTermsBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidGlossaryPayloadResponse(c);
  }

  return parsed.data;
});

const validateAttachGlossaryProjectBody = validator("json", (value, c) => {
  const parsed = attachGlossaryProjectBodySchema.safeParse(value);

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
      const { glossaries, total } = await glossaryStore.list(c.var.auth, query);
      return c.json({ glossaries: glossaries.map(toGlossaryRecord), total }, 200);
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

      return c.json({ glossaryTerms, total: glossaryTerms.length }, 200);
    })
    .post(
      "/:glossaryId/terms",
      validateGlossaryParams,
      validateCreateGlossaryTermBody,
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        if (glossary.source === "external_tms") {
          return externalTmsGlossaryImmutableResponse(c);
        }

        const term = await createGlossaryTerm(glossary, payload);
        if (!term) {
          return conflictResponse(
            c,
            "duplicate_glossary_term",
            "A term with this source text already exists",
          );
        }

        return c.json({ glossaryTerm: toGlossaryTermRecord(term, glossary) }, 201);
      },
    )
    .post(
      "/:glossaryId/terms/import",
      validateGlossaryParams,
      validateImportGlossaryTermsBody,
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        if (glossary.source === "external_tms") {
          return externalTmsGlossaryImmutableResponse(c);
        }

        const terms = parseGlossaryImport(payload);
        const created: GlossaryTermRecord[] = [];
        let skipped = 0;

        for (const termPayload of terms.slice(0, 2_000)) {
          const term = await createGlossaryTerm(glossary, termPayload);
          if (term) {
            created.push(toGlossaryTermRecord(term, glossary));
          } else {
            skipped++;
          }
        }

        return c.json({ glossaryTerms: created, imported: created.length, skipped }, 201);
      },
    )
    .patch(
      "/:glossaryId/terms/:termId",
      validateGlossaryTermParams,
      validateUpdateGlossaryTermBody,
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload = c.req.valid("json");
        const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        if (glossary.source === "external_tms") {
          return externalTmsGlossaryImmutableResponse(c);
        }

        if (payload.sourceTerm !== undefined) {
          const duplicateCheck = payload.caseSensitive
            ? eq(schema.glossaryTerms.sourceTerm, payload.sourceTerm)
            : sql`lower(${schema.glossaryTerms.sourceTerm}) = lower(${payload.sourceTerm})`;
          const existing = await db
            .select({ id: schema.glossaryTerms.id })
            .from(schema.glossaryTerms)
            .where(
              and(
                eq(schema.glossaryTerms.glossaryId, glossary.id),
                ne(schema.glossaryTerms.id, params.termId),
                duplicateCheck,
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            return conflictResponse(
              c,
              "duplicate_glossary_term",
              "A term with this source text already exists",
            );
          }
        }

        const [term] = await db
          .update(schema.glossaryTerms)
          .set(payload)
          .where(
            and(
              eq(schema.glossaryTerms.id, params.termId),
              eq(schema.glossaryTerms.glossaryId, glossary.id),
            ),
          )
          .returning();

        if (!term) {
          return glossaryNotFoundResponse(c);
        }

        return c.json({ glossaryTerm: toGlossaryTermRecord(term, glossary) }, 200);
      },
    )
    .delete("/:glossaryId/terms/:termId", validateGlossaryTermParams, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }
      if (glossary.source === "external_tms") {
        return externalTmsGlossaryImmutableResponse(c);
      }

      const deleted = await db
        .delete(schema.glossaryTerms)
        .where(
          and(
            eq(schema.glossaryTerms.id, params.termId),
            eq(schema.glossaryTerms.glossaryId, glossary.id),
          ),
        )
        .returning({ id: schema.glossaryTerms.id });

      if (deleted.length === 0) {
        return glossaryNotFoundResponse(c);
      }

      return c.body(null, 204);
    })
    .get("/:glossaryId/projects", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      return c.json({ projects: await listGlossaryProjects(c.var.auth, params.glossaryId) }, 200);
    })
    .post(
      "/:glossaryId/projects",
      validateGlossaryParams,
      validateAttachGlossaryProjectBody,
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }

        const params = c.req.valid("param");
        const payload: AttachGlossaryProjectBody = c.req.valid("json");
        const [glossary, project] = await Promise.all([
          glossaryStore.getById(c.var.auth, params.glossaryId),
          getOwnedProject(c.var.auth, payload.projectId),
        ]);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        if (!project) {
          return glossaryNotFoundResponse(c);
        }

        await db
          .insert(schema.projectGlossaries)
          .values({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            glossaryId: glossary.id,
            priority: payload.priority,
          })
          .onConflictDoUpdate({
            target: [schema.projectGlossaries.projectId, schema.projectGlossaries.glossaryId],
            set: { priority: payload.priority },
          });

        return c.json({ projects: await listGlossaryProjects(c.var.auth, params.glossaryId) }, 200);
      },
    )
    .delete("/:glossaryId/projects/:projectId", validateGlossaryProjectParams, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const [glossary, project] = await Promise.all([
        glossaryStore.getById(c.var.auth, params.glossaryId),
        getOwnedProject(c.var.auth, params.projectId),
      ]);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }
      if (!project) {
        return glossaryNotFoundResponse(c);
      }

      await db
        .delete(schema.projectGlossaries)
        .where(
          and(
            eq(
              schema.projectGlossaries.organizationId,
              c.var.auth.organization.localOrganizationId,
            ),
            eq(schema.projectGlossaries.projectId, project.id),
            eq(schema.projectGlossaries.glossaryId, glossary.id),
          ),
        );

      return c.body(null, 204);
    })
    .patch("/:glossaryId", validateGlossaryParams, validateUpdateGlossaryBody, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      if (glossary.source === "external_tms") {
        return externalTmsGlossaryImmutableResponse(c);
      }

      const updated = await glossaryStore.update(c.var.auth, params.glossaryId, payload);

      if (!updated) {
        return glossaryNotFoundResponse(c);
      }

      return c.json({ glossary: toGlossaryRecord(updated) }, 200);
    })
    .delete("/:glossaryId", validateGlossaryParams, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const glossary = await glossaryStore.getById(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      if (glossary.source === "external_tms") {
        return externalTmsGlossaryImmutableResponse(c);
      }

      const deleted = await glossaryStore.delete(c.var.auth, params.glossaryId);

      if (!deleted) {
        return glossaryNotFoundResponse(c);
      }

      return c.body(null, 204);
    });
}
