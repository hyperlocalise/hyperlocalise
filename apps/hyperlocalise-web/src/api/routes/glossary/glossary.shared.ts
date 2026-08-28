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
import { and, count, eq, inArray, sql } from "drizzle-orm";

import { ownedProjectWhere } from "@/api/auth/team-access";

import {
  badRequestResponse,
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import { canAccessGlossary } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import { db, schema } from "@/lib/database";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";
import { getTmsProviderLiveGlossary } from "@/lib/providers/jobs/tms-provider-live";
import { parseLiveProviderGlossaryId } from "@/lib/providers/jobs/tms-provider-resource-id";

export function invalidGlossaryPayloadResponse(c: { json: JsonContext["json"] }) {
  return validationErrorResponse(c, "invalid_glossary_payload", "Invalid glossary payload");
}

export function glossaryNotFoundResponse(c: { json: JsonContext["json"] }) {
  return notFoundResponse(c, "glossary_not_found", "Glossary not found");
}

export function forbiddenResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export function externalTmsGlossaryImmutableResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(
    c,
    "external_tms_glossary_immutable",
    "This glossary is managed by an external TMS and cannot be edited directly",
  );
}

export function nativeGlossaryConceptsOnlyResponse(c: { json: JsonContext["json"] }) {
  return badRequestResponse(
    c,
    "native_glossary_concepts_only",
    "Native glossary terms must be managed through concepts",
  );
}

export function glossaryTeamProjectRequiredResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(
    c,
    "glossary_team_project_required",
    "Team glossaries must attach at least one accessible project",
  );
}

export function glossaryOrgControlledResponse(c: { json: JsonContext["json"] }) {
  return sharedForbiddenResponse(
    c,
    "glossary_org_controlled",
    "This glossary is org-controlled and cannot be edited by translators",
  );
}

export function glossaryTeamMustBeNativeResponse(c: { json: JsonContext["json"] }) {
  return badRequestResponse(
    c,
    "glossary_team_must_be_native",
    "Team glossaries must be Hyperlocalise-owned",
  );
}

export function glossaryTeamNativeProjectRequiredResponse(c: { json: JsonContext["json"] }) {
  return badRequestResponse(
    c,
    "glossary_team_native_project_required",
    "Team glossaries must attach to Hyperlocalise-owned projects",
  );
}

export function glossarySourceLocaleAttachedProjectsResponse(c: { json: JsonContext["json"] }) {
  return badRequestResponse(
    c,
    "glossary_source_locale_attached_projects",
    "Cannot change the glossary source locale while attached projects use a different source locale",
  );
}

export function glossarySourceLocaleExistingTermsResponse(c: { json: JsonContext["json"] }) {
  return badRequestResponse(
    c,
    "glossary_source_locale_existing_terms",
    "Cannot change the glossary source locale while terms exist in the current source language",
  );
}

export async function deleteProjectWithTeamGlossaryGuard(
  auth: ApiAuthContext,
  projectId: string,
): Promise<"deleted" | "not_found" | "team_project_required"> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: schema.projects.id, source: schema.projects.source })
      .from(schema.projects)
      .where(await ownedProjectWhere(auth, projectId))
      .limit(1);

    if (!project) {
      return "not_found";
    }

    if (project.source === "native") {
      const teamGlossaries = await tx
        .select({ glossaryId: schema.glossaries.id })
        .from(schema.glossaries)
        .innerJoin(
          schema.projectGlossaries,
          eq(schema.projectGlossaries.glossaryId, schema.glossaries.id),
        )
        .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
        .where(
          and(
            eq(schema.projectGlossaries.projectId, projectId),
            eq(schema.projectGlossaries.organizationId, auth.organization.localOrganizationId),
            eq(schema.glossaries.organizationId, auth.organization.localOrganizationId),
            eq(schema.glossaries.controlLevel, "team"),
            eq(schema.projects.source, "native"),
          ),
        );

      const glossaryIds = teamGlossaries.map(({ glossaryId }) => glossaryId);
      if (glossaryIds.length > 0) {
        await tx
          .select({ id: schema.glossaries.id })
          .from(schema.glossaries)
          .where(inArray(schema.glossaries.id, glossaryIds))
          .for("update");

        for (const { glossaryId } of teamGlossaries) {
          const [row] = await tx
            .select({ nativeCount: count() })
            .from(schema.projectGlossaries)
            .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
            .where(
              and(
                eq(schema.projectGlossaries.glossaryId, glossaryId),
                eq(schema.projects.source, "native"),
              ),
            );

          if (Number(row?.nativeCount ?? 0) <= 1) {
            return "team_project_required";
          }
        }
      }
    }

    const deletedProjects = await tx
      .delete(schema.projects)
      .where(await ownedProjectWhere(auth, projectId))
      .returning({ id: schema.projects.id });

    return deletedProjects.length > 0 ? "deleted" : "not_found";
  });
}

export type GlossaryControlLevel = "org" | "team";

export function isGlossaryManageAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "glossaries:write");
}

export function isGlossaryContributorRole(role: ApiAuthContext["membership"]["role"]) {
  return role === "translator" || isGlossaryManageAllowed(role);
}

export function resolveCreateGlossaryControlLevel(
  role: ApiAuthContext["membership"]["role"],
  requested: GlossaryControlLevel | undefined,
): GlossaryControlLevel | null {
  if (isGlossaryManageAllowed(role)) {
    return requested ?? "org";
  }
  if (role === "translator") {
    if (requested === "org") {
      return null;
    }
    return "team";
  }
  return null;
}

export function isGlossaryContributeAllowed(
  role: ApiAuthContext["membership"]["role"],
  glossary: Pick<GlossaryRecord, "controlLevel" | "source">,
) {
  if (isGlossaryManageAllowed(role)) {
    return true;
  }
  return role === "translator" && glossary.controlLevel === "team" && glossary.source === "native";
}

export function glossaryContributeForbiddenResponse(
  c: { json: JsonContext["json"] },
  role: ApiAuthContext["membership"]["role"],
  glossary: Pick<GlossaryRecord, "controlLevel" | "source">,
) {
  if (role === "translator" && (glossary.controlLevel === "org" || glossary.source !== "native")) {
    return glossaryOrgControlledResponse(c);
  }
  return forbiddenResponse(c);
}

export async function getContributableGlossary(auth: ApiAuthContext, glossaryId: string) {
  const glossary = await getOwnedGlossary(auth, glossaryId);
  if (!glossary) {
    return { kind: "not_found" as const };
  }
  if (!isGlossaryContributeAllowed(auth.membership.role, glossary)) {
    return { kind: "forbidden" as const, glossary };
  }
  return { kind: "ok" as const, glossary };
}

export async function ownedGlossaryWhere(auth: ApiAuthContext, glossaryId: string) {
  const glossary = await canAccessGlossary(auth, glossaryId);
  if (!glossary) {
    return sql`false`;
  }

  return and(
    eq(schema.glossaries.id, glossaryId),
    eq(schema.glossaries.organizationId, auth.organization.localOrganizationId),
  );
}

export async function getOwnedGlossary(auth: ApiAuthContext, glossaryId: string) {
  const liveId = parseLiveProviderGlossaryId(glossaryId);
  if (liveId?.providerKind === "crowdin") {
    const liveGlossary = await getTmsProviderLiveGlossary(
      auth.organization.localOrganizationId,
      glossaryId,
      {
        actorUserId: auth.user.localUserId,
      },
    );
    if (!liveGlossary) return null;

    const now = new Date();
    const ephemeralGlossary: GlossaryRecord = {
      id: glossaryId,
      organizationId: auth.organization.localOrganizationId,
      createdByUserId: null,
      name: liveGlossary.name,
      description: liveGlossary.description ?? "",
      sourceLocale: liveGlossary.sourceLocale,
      targetLocale: liveGlossary.targetLocale || null,
      status: "active",
      source: "external_tms",
      controlLevel: "org",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: null,
      externalProjectId: liveGlossary.externalProjectId,
      externalResourceType: "glossary",
      externalGlossaryId: liveId.externalGlossaryId,
      localeCoverage: liveGlossary.localeCoverage,
      termCount: liveGlossary.termCount,
      syncState: null,
      termCapabilities: {},
      externalUrl: liveGlossary.externalUrl,
      lastSyncedAt: null,
      lastSyncErrorAt: null,
      lastSyncErrorMessage: null,
      providerMetadata: {},
      createdAt: now,
      updatedAt: now,
    };
    return ephemeralGlossary;
  }

  const [glossary] = await db
    .select()
    .from(schema.glossaries)
    .where(await ownedGlossaryWhere(auth, glossaryId))
    .limit(1);

  return glossary ?? null;
}
