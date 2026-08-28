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
import { count, desc, eq, and } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { ownedProjectWhere } from "@/api/auth/team-access";
import { badRequestResponse } from "@/api/errors";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database";
import { Glossary, type NativeGlossary } from "@/lib/glossary/glossary";
import { getGlossaryProduct } from "@/lib/glossary/glossary-provider";
import { toGlossaryRecord } from "@/lib/glossary/glossary-records";
import { isUserMemberOfTeam } from "@/lib/glossary/attached-team-glossaries";
import {
  queryNativeGlossaryTermCountForGlossary,
  queryNativeGlossaryTermCounts,
} from "@/lib/glossary/query-glossary-term-counts";
import { NativeGlossary as NativeGlossaryProduct } from "@/lib/glossary/native-glossary";
import {
  queryNativeGlossaryLanguages,
  queryNativeGlossaryLanguagesForGlossary,
} from "@/lib/glossary/query-glossary-languages";
import {
  queryGlossaryTeamNamesById,
  resolveGlossaryTeamName,
} from "@/lib/glossary/query-glossary-team-names";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import {
  getOwnedProject,
  getOwnedProjectRecord,
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
  type GlossaryRecord,
  type ListGlossaryQuery,
} from "./glossary.schema";
import {
  externalGlossaryLocaleReadonlyResponse,
  externalTmsGlossaryImmutableResponse,
  forbiddenResponse,
  glossaryTeamMembershipRequiredResponse,
  glossaryTeamMustBeNativeResponse,
  glossaryTeamNativeProjectRequiredResponse,
  glossaryTeamNotFoundResponse,
  glossaryTeamProjectRequiredResponse,
  glossarySourceLocaleAttachedProjectsResponse,
  glossarySourceLocaleExistingTermsResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryManageAllowed,
  resolveCreateGlossaryControlLevel,
  getOwnedGlossary,
  glossaryNotFoundResponse,
} from "./glossary.shared";

function toGlossaryRecordWithTeamName(
  glossary: Parameters<typeof toGlossaryRecord>[0],
  teamNamesById: ReadonlyMap<string, string>,
  languages?: GlossaryRecord["languages"],
  termCount?: number | null,
  projectCount = 0,
) {
  return toGlossaryRecord(
    glossary,
    languages,
    termCount,
    projectCount,
    resolveGlossaryTeamName(glossary, teamNamesById),
  );
}

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

type CreateNativeGlossaryResult =
  | { status: "created"; glossary: NativeGlossary; projectCount: number }
  | { status: "project_not_found" }
  | { status: "team_native_project_required" }
  | { status: "source_locale_mismatch" }
  | { status: "team_not_found" }
  | { status: "team_membership_required" };

type CreateNativeGlossaryTxResult =
  | { error: "project_not_found" }
  | { error: "team_native_project_required" }
  | { error: "source_locale_mismatch" }
  | { error: "team_not_found" }
  | { error: "team_membership_required" }
  | { glossary: NativeGlossary; projectCount: number };

async function createNativeGlossary(
  auth: ApiAuthContext,
  payload: CreateGlossaryBody & { controlLevel: "org" | "team" },
  projectIds: string[] = [],
): Promise<CreateNativeGlossaryResult> {
  const organizationId = auth.organization.localOrganizationId;
  const uniqueProjectIds = [...new Set(projectIds)];

  const result = await db.transaction(async (tx): Promise<CreateNativeGlossaryTxResult> => {
    const lockedProjects: Array<{
      id: string;
      source: string;
      sourceLocale: string | null;
      teamId: string | null;
    }> = [];

    for (const projectId of uniqueProjectIds.toSorted()) {
      const [project] = await tx
        .select({
          id: schema.projects.id,
          source: schema.projects.source,
          sourceLocale: schema.projects.sourceLocale,
          teamId: schema.projects.teamId,
        })
        .from(schema.projects)
        .where(await ownedProjectWhere(auth, projectId))
        .limit(1)
        .for("update");

      if (!project) {
        return { error: "project_not_found" as const };
      }

      lockedProjects.push(project);
    }

    if (
      payload.controlLevel === "team" &&
      lockedProjects.some((project) => project.source !== "native")
    ) {
      return { error: "team_native_project_required" as const };
    }

    if (
      lockedProjects.some(
        (project) => !project.sourceLocale || project.sourceLocale !== payload.sourceLocale,
      )
    ) {
      return { error: "source_locale_mismatch" as const };
    }

    let resolvedTeamId: string | null = null;
    if (payload.controlLevel === "team") {
      resolvedTeamId = payload.teamId ?? lockedProjects[0]?.teamId ?? null;
      if (!resolvedTeamId) {
        return { error: "team_not_found" as const };
      }

      const [team] = await tx
        .select({ id: schema.teams.id })
        .from(schema.teams)
        .where(
          and(eq(schema.teams.id, resolvedTeamId), eq(schema.teams.organizationId, organizationId)),
        )
        .limit(1);

      if (!team) {
        return { error: "team_not_found" as const };
      }

      const isMember = await isUserMemberOfTeam(
        auth.user.localUserId,
        resolvedTeamId,
        organizationId,
        tx,
      );
      if (!isMember) {
        return { error: "team_membership_required" as const };
      }
    }

    const [created] = await tx
      .insert(schema.glossaries)
      .values({
        organizationId,
        createdByUserId: auth.user.localUserId,
        name: payload.name,
        description: payload.description ?? "",
        sourceLocale: payload.sourceLocale,
        targetLocale: null,
        controlLevel: payload.controlLevel,
        teamId: resolvedTeamId,
      })
      .returning();

    if (uniqueProjectIds.length > 0) {
      await tx.insert(schema.projectGlossaries).values(
        uniqueProjectIds.map((projectId) => ({
          organizationId,
          projectId,
          glossaryId: created.id,
          priority: 0,
        })),
      );
    }

    return { glossary: created, projectCount: uniqueProjectIds.length };
  });

  if ("error" in result) {
    return { status: result.error };
  }

  serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.glossaryCreated, {
    status: "created",
    source: "glossary",
  });
  return {
    status: "created",
    glossary: result.glossary,
    projectCount: result.projectCount,
  };
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
      const teamNamesById = await queryGlossaryTeamNamesById(glossaries);
      const records = await mapWithConcurrency(glossaries, 5, async (glossary) => {
        const product = productsByGlossaryId.get(glossary.id);
        const termCount =
          glossary.source === "native" ? (termCountsByGlossaryId.get(glossary.id) ?? 0) : undefined;
        const projectCount = projectCountsByGlossaryId.get(glossary.id) ?? 0;
        if (product) {
          const remote = await product.get();
          const languages = languagesByGlossaryId.get(glossary.id);
          return languages
            ? toGlossaryRecordWithTeamName(
                remote ?? glossary,
                teamNamesById,
                languages,
                termCount,
                projectCount,
              )
            : toGlossaryRecordWithTeamName(
                remote ?? glossary,
                teamNamesById,
                undefined,
                termCount,
                projectCount,
              );
        }
        return toGlossaryRecordWithTeamName(
          glossary,
          teamNamesById,
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

      const createResult = await createNativeGlossary(
        c.var.auth,
        { ...payload, controlLevel },
        requestedProjectIds,
      );
      switch (createResult.status) {
        case "project_not_found":
          return projectNotFoundResponse(c);
        case "team_native_project_required":
          return glossaryTeamNativeProjectRequiredResponse(c);
        case "source_locale_mismatch":
          return badRequestResponse(
            c,
            "glossary_source_locale_mismatch",
            "The selected project uses a different source locale",
          );
        case "team_not_found":
          return glossaryTeamNotFoundResponse(c);
        case "team_membership_required":
          return glossaryTeamMembershipRequiredResponse(c);
        case "created": {
          const teamNamesById = await queryGlossaryTeamNamesById([createResult.glossary]);
          return c.json(
            {
              glossary: toGlossaryRecordWithTeamName(
                createResult.glossary,
                teamNamesById,
                undefined,
                0,
                createResult.projectCount,
              ),
            },
            201,
          );
        }
      }
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
      const teamNamesById = await queryGlossaryTeamNamesById([glossary]);
      if (product) {
        const remote = await product.get();
        const languages =
          glossary.source === "native"
            ? await queryNativeGlossaryLanguagesForGlossary(glossary)
            : undefined;
        return c.json(
          {
            glossary: languages
              ? toGlossaryRecordWithTeamName(
                  remote ?? glossary,
                  teamNamesById,
                  languages,
                  termCount,
                  projectCount,
                )
              : toGlossaryRecordWithTeamName(
                  remote ?? glossary,
                  teamNamesById,
                  undefined,
                  termCount,
                  projectCount,
                ),
          },
          200,
        );
      }

      return c.json(
        {
          glossary: toGlossaryRecordWithTeamName(
            glossary,
            teamNamesById,
            undefined,
            termCount,
            projectCount,
          ),
        },
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
        if (!projectRecord) {
          return projectNotFoundResponse(c);
        }
        if (!projectRecord.sourceLocale) {
          return badRequestResponse(
            c,
            "glossary_source_locale_mismatch",
            "The selected project uses a different source locale",
          );
        }

        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);

        if (product instanceof NativeGlossaryProduct) {
          const result = await product.attachProjectWithGuard(project.id, payload.priority, {
            source: projectRecord.source,
            sourceLocale: projectRecord.sourceLocale,
          });
          switch (result.status) {
            case "source_locale_mismatch":
              return badRequestResponse(
                c,
                "glossary_source_locale_mismatch",
                "The selected project uses a different source locale",
              );
            case "team_native_project_required":
              return glossaryTeamNativeProjectRequiredResponse(c);
            case "not_found":
              return glossaryNotFoundResponse(c);
            case "attached":
              break;
          }
        } else {
          if (projectRecord.sourceLocale !== glossary.sourceLocale) {
            return badRequestResponse(
              c,
              "glossary_source_locale_mismatch",
              "The selected project uses a different source locale",
            );
          }
          await product.attachProject(project.id, payload.priority);
        }

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

      if (product instanceof NativeGlossaryProduct) {
        const result = await product.detachProjectWithTeamGuard(project.id);
        if (result === "team_project_required") {
          return glossaryTeamProjectRequiredResponse(c);
        }
      } else {
        await product.detachProject(project.id);
      }

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
      if (glossary.source !== "native" && payload.sourceLocale !== undefined) {
        return externalGlossaryLocaleReadonlyResponse(c);
      }

      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return externalTmsGlossaryImmutableResponse(c);

      const needsAttachmentGuard =
        product instanceof NativeGlossaryProduct &&
        (payload.controlLevel === "team" ||
          (payload.sourceLocale !== undefined && payload.sourceLocale !== glossary.sourceLocale));

      if (needsAttachmentGuard) {
        const result = await product.updateWithAttachmentGuard(payload);
        switch (result.status) {
          case "team_project_required":
            return glossaryTeamProjectRequiredResponse(c);
          case "team_native_project_required":
            return glossaryTeamNativeProjectRequiredResponse(c);
          case "source_locale_attached_projects":
            return glossarySourceLocaleAttachedProjectsResponse(c);
          case "source_locale_existing_terms":
            return glossarySourceLocaleExistingTermsResponse(c);
          case "not_found":
            return glossaryNotFoundResponse(c);
          case "updated": {
            const termCount = await queryNativeGlossaryTermCountForGlossary(result.glossary);
            const projectCount = await product.queryProjectCount();
            const teamNamesById = await queryGlossaryTeamNamesById([result.glossary]);
            return c.json(
              {
                glossary: toGlossaryRecordWithTeamName(
                  result.glossary,
                  teamNamesById,
                  undefined,
                  termCount,
                  projectCount,
                ),
              },
              200,
            );
          }
        }
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
      const teamNamesById = await queryGlossaryTeamNamesById([updated]);
      return c.json(
        {
          glossary: toGlossaryRecordWithTeamName(
            updated,
            teamNamesById,
            undefined,
            termCount,
            projectCount,
          ),
        },
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
