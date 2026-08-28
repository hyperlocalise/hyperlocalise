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
import { count, desc } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse } from "@/api/errors";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database";
import { Glossary, type NativeGlossary } from "@/lib/glossary/glossary";
import { getGlossaryProduct } from "@/lib/glossary/glossary-provider";
import { toGlossaryRecord } from "@/lib/glossary/glossary-records";
import {
  queryNativeGlossaryTermCountForGlossary,
  queryNativeGlossaryTermCounts,
} from "@/lib/glossary/query-glossary-term-counts";
import {
  queryNativeGlossaryLanguages,
  queryNativeGlossaryLanguagesForGlossary,
} from "@/lib/glossary/query-glossary-languages";
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
  glossaryIdParamsSchema,
  glossaryProjectParamsSchema,
  listGlossaryQuerySchema,
  updateGlossaryBodySchema,
  type AttachGlossaryProjectBody,
  type CreateGlossaryBody,
  type ListGlossaryQuery,
} from "./glossary.schema";
import {
  externalTmsGlossaryImmutableResponse,
  forbiddenResponse,
  glossaryTeamMustBeNativeResponse,
  glossaryTeamNativeProjectRequiredResponse,
  glossaryTeamProjectRequiredResponse,
  glossarySourceLocaleAttachedProjectsResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryManageAllowed,
  resolveCreateGlossaryControlLevel,
  getOwnedGlossary,
  glossaryNotFoundResponse,
} from "./glossary.shared";

type GlossaryListResult = {
  glossaries: NativeGlossary[];
  total: number;
  languagesByGlossaryId: Map<string, ReturnType<typeof toGlossaryRecord>["languages"]>;
  termCountsByGlossaryId: Map<string, number>;
  projectCountsByGlossaryId: Map<string, number>;
  productsByGlossaryId: Map<string, Glossary>;
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

  const productsByGlossaryId = new Map<string, Glossary>();
  for (const glossary of glossaries) {
    const product = getGlossaryProduct({ auth, glossary });
    if (product) {
      productsByGlossaryId.set(glossary.id, product);
    }
  }

  const [languagesByGlossaryId, termCountsByGlossaryId, projectCountsByGlossaryId] =
    await Promise.all([
      queryNativeGlossaryLanguages(glossaries),
      queryNativeGlossaryTermCounts(glossaries),
      Glossary.queryProjectCounts([...productsByGlossaryId.values()]),
    ]);

  return {
    glossaries,
    total: totalRow[0]?.value ?? 0,
    languagesByGlossaryId,
    termCountsByGlossaryId,
    projectCountsByGlossaryId,
    productsByGlossaryId,
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
        controlLevel: payload.controlLevel ?? "org",
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

const validateGlossaryParams = validator("param", (value, c) => {
  const parsed = glossaryIdParamsSchema.safeParse(value);

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
      const {
        glossaries,
        total,
        languagesByGlossaryId,
        termCountsByGlossaryId,
        projectCountsByGlossaryId,
        productsByGlossaryId,
      } = await listGlossaries(c.var.auth, query);
      const records = await mapWithConcurrency(glossaries, 5, async (glossary) => {
        const product = productsByGlossaryId.get(glossary.id);
        const termCount =
          glossary.source === "native" ? (termCountsByGlossaryId.get(glossary.id) ?? 0) : undefined;
        const projectCount = projectCountsByGlossaryId.get(glossary.id) ?? 0;
        if (product) {
          const remote = await product.get();
          const languages = languagesByGlossaryId.get(glossary.id);
          return languages
            ? toGlossaryRecord(remote ?? glossary, languages, termCount, projectCount)
            : toGlossaryRecord(remote ?? glossary, undefined, termCount, projectCount);
        }
        return toGlossaryRecord(
          glossary,
          languagesByGlossaryId.get(glossary.id),
          termCount,
          projectCount,
        );
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
      const payload = c.req.valid("json");
      const controlLevel = resolveCreateGlossaryControlLevel(
        c.var.auth.membership.role,
        payload.controlLevel,
      );
      if (!controlLevel) {
        return forbiddenResponse(c);
      }

      const requestedProjectIds =
        payload.projectIds ?? (payload.projectId ? [payload.projectId] : []);
      if (controlLevel === "team" && requestedProjectIds.length === 0) {
        return glossaryTeamProjectRequiredResponse(c);
      }
      const projects = await mapWithConcurrency(requestedProjectIds, 5, (projectId) =>
        getOwnedProjectRecord(c.var.auth, projectId),
      );
      if (projects.some((project) => !project)) {
        return projectNotFoundResponse(c);
      }
      if (controlLevel === "team" && projects.some((project) => project?.source !== "native")) {
        return glossaryTeamNativeProjectRequiredResponse(c);
      }
      if (projects.some((project) => project?.sourceLocale !== payload.sourceLocale)) {
        return badRequestResponse(
          c,
          "glossary_source_locale_mismatch",
          "The selected project uses a different source locale",
        );
      }
      const projectIds = projects.flatMap((project) => (project ? [project.id] : []));
      const glossary = await createNativeGlossary(
        c.var.auth,
        { ...payload, controlLevel },
        projectIds,
      );
      return c.json({ glossary: toGlossaryRecord(glossary, undefined, 0, projectIds.length) }, 201);
    })
    .get("/:glossaryId", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      const termCount =
        glossary.source === "native"
          ? await queryNativeGlossaryTermCountForGlossary(glossary)
          : undefined;
      const projectCount = product ? await product.queryProjectCount() : 0;
      if (product) {
        const remote = await product.get();
        const languages =
          glossary.source === "native"
            ? await queryNativeGlossaryLanguagesForGlossary(glossary)
            : undefined;
        return c.json(
          {
            glossary: languages
              ? toGlossaryRecord(remote ?? glossary, languages, termCount, projectCount)
              : toGlossaryRecord(remote ?? glossary, undefined, termCount, projectCount),
          },
          200,
        );
      }

      return c.json(
        { glossary: toGlossaryRecord(glossary, undefined, termCount, projectCount) },
        200,
      );
    })
    .get("/:glossaryId/projects", validateGlossaryParams, async (c) => {
      const params = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      return c.json({ projects: product ? await product.listProjects() : [] }, 200);
    })
    .post(
      "/:glossaryId/projects",
      validateGlossaryParams,
      validateAttachGlossaryProjectBody,
      async (c) => {
        if (!isGlossaryManageAllowed(c.var.auth.membership.role)) {
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
        const projectRecord = await getOwnedProjectRecord(c.var.auth, payload.projectId);
        if (projectRecord && projectRecord.sourceLocale !== glossary.sourceLocale) {
          return badRequestResponse(
            c,
            "glossary_source_locale_mismatch",
            "The selected project uses a different source locale",
          );
        }
        if (glossary.controlLevel === "team" && projectRecord?.source !== "native") {
          return glossaryTeamNativeProjectRequiredResponse(c);
        }

        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        await product.attachProject(project.id, payload.priority);

        return c.json({ projects: await product.listProjects() }, 200);
      },
    )
    .delete("/:glossaryId/projects/:projectId", validateGlossaryProjectParams, async (c) => {
      if (!isGlossaryManageAllowed(c.var.auth.membership.role)) {
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

      if (glossary.controlLevel === "team") {
        const attachedProjects = await product.listProjects();
        const remainingNativeProjects = attachedProjects.filter(
          (attachedProject) =>
            attachedProject.projectId !== project.id && attachedProject.source === "native",
        );
        if (remainingNativeProjects.length === 0) {
          return glossaryTeamProjectRequiredResponse(c);
        }
      }

      await product.detachProject(project.id);

      return c.body(null, 204);
    })
    .patch("/:glossaryId", validateGlossaryParams, validateUpdateGlossaryBody, async (c) => {
      if (!isGlossaryManageAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const params = c.req.valid("param");
      const payload = c.req.valid("json");
      const glossary = await getOwnedGlossary(c.var.auth, params.glossaryId);

      if (!glossary) {
        return glossaryNotFoundResponse(c);
      }
      if (payload.controlLevel === "team" && glossary.source !== "native") {
        return glossaryTeamMustBeNativeResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return externalTmsGlossaryImmutableResponse(c);

      const attachedProjects =
        payload.controlLevel === "team" ||
        (payload.sourceLocale !== undefined && payload.sourceLocale !== glossary.sourceLocale)
          ? await product.listProjects()
          : [];

      if (payload.controlLevel === "team") {
        if (attachedProjects.length === 0) {
          return glossaryTeamProjectRequiredResponse(c);
        }
        if (attachedProjects.some((project) => project.source !== "native")) {
          return glossaryTeamNativeProjectRequiredResponse(c);
        }
      }

      if (
        payload.sourceLocale !== undefined &&
        payload.sourceLocale !== glossary.sourceLocale &&
        attachedProjects.some((project) => project.sourceLocale !== payload.sourceLocale)
      ) {
        return glossarySourceLocaleAttachedProjectsResponse(c);
      }

      const updated = await product.update(payload);

      if (!updated) {
        return glossaryNotFoundResponse(c);
      }

      const termCount =
        updated.source === "native"
          ? await queryNativeGlossaryTermCountForGlossary(updated)
          : undefined;
      const projectCount = await product.queryProjectCount();
      return c.json(
        { glossary: toGlossaryRecord(updated, undefined, termCount, projectCount) },
        200,
      );
    })
    .delete("/:glossaryId", validateGlossaryParams, async (c) => {
      if (!isGlossaryManageAllowed(c.var.auth.membership.role)) {
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
