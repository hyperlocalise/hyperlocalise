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
import { eq, and } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type ApiAuthContext, type AuthVariables } from "@/api/auth/workos";
import { ownedProjectWhere } from "@/api/auth/team-access";
import { badRequestResponse } from "@/api/response.schema";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database/client";
import { type NativeGlossary } from "@/lib/glossary/glossary";
import { getGlossaryProduct } from "@/lib/glossary/glossary-provider";
import { toGlossaryRecord } from "@/lib/glossary/glossary-records";
import { isUserMemberOfTeam } from "@/lib/glossary/attached-team-glossaries";
import { queryNativeGlossaryTermCountForGlossary } from "@/lib/glossary/query-glossary-term-counts";
import { enqueueActivityLogEvent } from "@/lib/activity-log/activity-log-writer";
import { queryNativeGlossaryLanguagesForGlossary } from "@/lib/glossary/query-glossary-languages";
import {
  queryGlossaryTeamNamesById,
  resolveGlossaryTeamName,
} from "@/lib/glossary/query-glossary-team-names";

import { projectNotFoundResponse } from "../project/project.shared";
import { createGlossaryConceptRoutes } from "./glossary-concept.route";
import {
  createGlossaryBodySchema,
  glossaryIdParamsSchema,
  type CreateGlossaryBody,
  type GlossaryRecord,
} from "./glossary.schema";
import {
  forbiddenResponse,
  glossaryTeamMembershipRequiredResponse,
  glossaryTeamNativeProjectRequiredResponse,
  glossaryTeamNotFoundResponse,
  glossaryTeamProjectRequiredResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryManageAllowed,
  resolveCreateGlossaryControlLevel,
  getOwnedGlossary,
  glossaryNotFoundResponse,
  canContributeToGlossary,
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

      if (!isGlossaryManageAllowed(auth.membership.role)) {
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

const validateCreateGlossaryBody = validator("json", (value, c) => {
  const parsed = createGlossaryBodySchema.safeParse(value);

  if (!parsed.success) {
    return invalidGlossaryPayloadResponse(c);
  }

  return parsed.data;
});

export function createGlossaryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .route("/:glossaryId/concepts", createGlossaryConceptRoutes())
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
          await enqueueActivityLogEvent({
            actorCredentialId: null,
            actorKind: "user",
            actorUserId: c.var.auth.user.localUserId,
            eventType: "glossary_created",
            organizationId: c.var.auth.organization.localOrganizationId,
            payload: {
              name: createResult.glossary.name,
              providerKind: createResult.glossary.externalProviderKind ?? undefined,
              resourceId: createResult.glossary.id,
              source: createResult.glossary.source,
            },
            targetId: createResult.glossary.id,
            targetKind: "glossary",
          });
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
      const canContribute = await canContributeToGlossary(c.var.auth, glossary);
      if (product) {
        const remote = await product.get();
        const resolvedGlossary = remote ?? glossary;
        const languages =
          glossary.source === "native"
            ? await queryNativeGlossaryLanguagesForGlossary(glossary)
            : undefined;
        return c.json(
          {
            glossary: languages
              ? toGlossaryRecordWithTeamName(
                  resolvedGlossary,
                  teamNamesById,
                  languages,
                  termCount,
                  projectCount,
                )
              : toGlossaryRecordWithTeamName(
                  resolvedGlossary,
                  teamNamesById,
                  undefined,
                  termCount,
                  projectCount,
                ),
            canContribute,
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
          canContribute,
        },
        200,
      );
    });
}
