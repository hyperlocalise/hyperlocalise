/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, conflictResponse } from "@/api/errors";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { db, schema } from "@/lib/database";
import type { NativeGlossary } from "@/lib/glossary/glossary";
import { getGlossaryProduct } from "@/lib/glossary/glossary-provider";
import { toGlossaryRecord } from "@/lib/glossary/glossary-records";
import { listGlossaryTermsByGlossaryId } from "@/lib/glossary/query-glossary-terms";
import { queryNativeGlossaryLanguages } from "@/lib/glossary/query-glossary-languages";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import {
  getOwnedProjectRecord,
  getOwnedProject,
  projectNotFoundResponse,
} from "../project/project.shared";
import { createGlossaryConceptRoutes } from "./glossary-concept.route";
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
} from "./glossary.schema";
import {
  externalTmsGlossaryImmutableResponse,
  forbiddenResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryMutationAllowed,
  getOwnedGlossary,
  glossaryNotFoundResponse,
} from "./glossary.shared";

type GlossaryListResult = {
  glossaries: NativeGlossary[];
  total: number;
  languagesByGlossaryId: Map<string, ReturnType<typeof toGlossaryRecord>["languages"]>;
};

type GlossaryProjectRecord = {
  projectId: string;
  projectName: string;
  priority: number;
  sourceLocale: string | null;
  targetLocales: string[];
};

async function listGlossaries(
  auth: ApiAuthContext,
  query?: ListGlossaryQuery,
): Promise<GlossaryListResult> {
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

  return {
    glossaries,
    total: totalRow[0]?.value ?? 0,
    languagesByGlossaryId: await queryNativeGlossaryLanguages(glossaries),
  };
}

async function createNativeGlossary(
  auth: ApiAuthContext,
  payload: CreateGlossaryBody,
  projectIds: string[] = [],
): Promise<NativeGlossary> {
  const glossary = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.glossaries)
      .values({
        organizationId: auth.organization.localOrganizationId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description ?? "",
        sourceLocale: payload.sourceLocale,
        targetLocale: null,
      })
      .returning();

    if (projectIds.length > 0) {
      await tx.insert(schema.projectGlossaries).values(
        projectIds.map((projectId) => ({
          organizationId: auth.organization.localOrganizationId,
          projectId,
          glossaryId: created.id,
          priority: 0,
        })),
      );
    }

    return created;
  });

  serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.glossaryCreated, {
    status: "created",
    source: "glossary",
  });
  return glossary;
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

async function listGlossaryProjects(
  auth: ApiAuthContext,
  glossaryId: string,
): Promise<GlossaryProjectRecord[]> {
  const accessibleProjectsWhere = await buildAccessibleProjectsWhere(auth);

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
        accessibleProjectsWhere,
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
    .route("/:glossaryId/concepts", createGlossaryConceptRoutes())
    .get("/", validateListGlossaryQuery, async (c) => {
      const query = c.req.valid("query");
      const { glossaries, total, languagesByGlossaryId } = await listGlossaries(c.var.auth, query);
      const records = await mapWithConcurrency(glossaries, 5, async (glossary) => {
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (product) {
          const remote = await product.get();
          return toGlossaryRecord(remote ?? glossary);
        }
        return toGlossaryRecord(glossary, languagesByGlossaryId.get(glossary.id));
      });
      return c.json(
        {
          glossaries: records,
          total,
        },
        200,
      );
    })
    .post("/", validateCreateGlossaryBody, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const payload = c.req.valid("json");
      const requestedProjectIds =
        payload.projectIds ?? (payload.projectId ? [payload.projectId] : []);
      const projects = await mapWithConcurrency(requestedProjectIds, 5, (projectId) =>
        getOwnedProjectRecord(c.var.auth, projectId),
      );
      if (projects.some((project) => !project)) {
        return projectNotFoundResponse(c);
      }
      if (projects.some((project) => project?.sourceLocale !== payload.sourceLocale)) {
        return badRequestResponse(
          c,
          "glossary_source_locale_mismatch",
          "The selected project uses a different source locale",
        );
      }
      const glossary = await createNativeGlossary(
        c.var.auth,
        payload,
        projects.flatMap((project) => (project ? [project.id] : [])),
      );
      return c.json({ glossary: toGlossaryRecord(glossary) }, 201);
    })
    .get("/:glossaryId", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (product) {
        const remote = await product.get();
        return c.json({ glossary: toGlossaryRecord(remote ?? glossary) }, 200);
      }

      return c.json({ glossary: toGlossaryRecord(glossary) }, 200);
    })
    .get("/:glossaryId/terms", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (product) {
        const glossaryTerms = await product.listTerms();
        return c.json({ glossaryTerms, total: glossaryTerms.length }, 200);
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
        const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) {
          return externalTmsGlossaryImmutableResponse(c);
        }
        let term: Awaited<ReturnType<typeof product.createGlossaryTerm>>;
        try {
          term = await product.createGlossaryTerm(payload);
        } catch (error) {
          if (error instanceof Error && error.message === "provider_credential_not_found") {
            return externalTmsGlossaryImmutableResponse(c);
          }
          throw error;
        }
        if (!term) {
          return conflictResponse(
            c,
            "duplicate_glossary_term",
            "A term with this source text already exists",
          );
        }

        serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.glossaryTermCreated, {
          status: "created",
          source: "glossary",
        });
        return c.json({ glossaryTerm: term }, 201);
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
        const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) {
          return externalTmsGlossaryImmutableResponse(c);
        }

        const terms = parseGlossaryImport(payload);
        const limitedTerms = terms.slice(0, 2_000);
        const { created, skipped } = await product.createGlossaryTerms(limitedTerms);

        return c.json(
          {
            glossaryTerms: created,
            imported: created.length,
            skipped,
          },
          201,
        );
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
        const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const updated = await product.updateGlossaryTerm(params.termId, payload);
        if (!updated) return glossaryNotFoundResponse(c);
        if ("error" in updated && updated.error === "duplicate") {
          return conflictResponse(
            c,
            "duplicate_glossary_term",
            "A term with this source text already exists",
          );
        }
        return c.json({ glossaryTerm: updated }, 200);
      },
    )
    .delete("/:glossaryId/terms/:termId", validateGlossaryTermParams, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }
      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return externalTmsGlossaryImmutableResponse(c);
      const deleted = await product.deleteGlossaryTerm(params.termId);
      if (!deleted) {
        return glossaryNotFoundResponse(c);
      }

      return c.body(null, 204);
    })
    .get("/:glossaryId/projects", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

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
          getOwnedGlossary(c.var.auth, params.glossaryId),
          getOwnedProject(c.var.auth, payload.projectId),
        ]);

        if (!glossary) {
          return glossaryNotFoundResponse(c);
        }
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        await product.attachProject(project.id, payload.priority);

        return c.json({ projects: await listGlossaryProjects(c.var.auth, params.glossaryId) }, 200);
      },
    )
    .delete("/:glossaryId/projects/:projectId", validateGlossaryProjectParams, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const [glossary, project] = await Promise.all([
        getOwnedGlossary(c.var.auth, params.glossaryId),
        getOwnedProject(c.var.auth, params.projectId),
      ]);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return externalTmsGlossaryImmutableResponse(c);
      await product.detachProject(project.id);

      return c.body(null, 204);
    })
    .patch("/:glossaryId", validateGlossaryParams, validateUpdateGlossaryBody, async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return externalTmsGlossaryImmutableResponse(c);
      const updated = await product.update(payload);

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
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return externalTmsGlossaryImmutableResponse(c);
      const deleted = await product.delete();

      if (!deleted) {
        return glossaryNotFoundResponse(c);
      }

      return c.body(null, 204);
    });
}
