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
import { and, eq, inArray, or } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";
import { createLogger } from "@/lib/log";
import { createGlossary } from "@/lib/glossary/glossary-provider";
import {
  buildGlossaryTsQuery,
  type GlossaryConcordanceContext,
  type GlossaryConcordanceQuery,
} from "@/lib/glossary/glossary";
import {
  mergeGlossaryMatches,
  type NormalizedGlossaryMatch,
} from "@/lib/providers/contracts/glossary-match";

const glossaryLogger = createLogger("glossary-concordance");

export { buildGlossaryTsQuery };

type AttachedGlossaryRecord = GlossaryRecord;

export type GlossaryConcordanceSearchInput = GlossaryConcordanceQuery & {
  projectId?: string;
  organizationId?: string;
  actorUserId?: string | null;
  glossaryIds?: string[];
};

/** Native projects use only native glossaries; external projects may use native or Crowdin glossaries. */
export function shouldIncludeAttachedGlossary(
  projectSource: (typeof schema.projectSourceEnum.enumValues)[number],
  glossary: AttachedGlossaryRecord,
): boolean {
  if (projectSource === "native") {
    return glossary.source === "native";
  }

  if (glossary.source === "native") {
    return true;
  }

  return glossary.source === "external_tms" && glossary.externalProviderKind === "crowdin";
}

function supportsConcordanceSearch(glossary: AttachedGlossaryRecord): boolean {
  if (glossary.source === "native") {
    return true;
  }

  if (glossary.source !== "external_tms" || glossary.externalProviderKind !== "crowdin") {
    return false;
  }

  const termCapabilities = glossary.termCapabilities as Record<string, unknown>;
  if (termCapabilities.referenceOnly === true || termCapabilities.search === false) {
    return false;
  }

  return true;
}

function createConcordanceProviderContext(input: {
  organizationId: string;
  actorUserId?: string | null;
  glossary: GlossaryRecord;
}): Parameters<typeof createGlossary>[0] {
  const auth = {
    user: {
      workosUserId: "",
      localUserId: input.actorUserId ?? "",
      email: "",
    },
    organizations: [],
    organization: {
      workosOrganizationId: "",
      localOrganizationId: input.organizationId,
      name: "",
      membership: {
        role: "admin" as const,
        accessSource: "workos_authoritative" as const,
      },
    },
    activeOrganization: {
      workosOrganizationId: "",
      localOrganizationId: input.organizationId,
      name: "",
      membership: {
        role: "admin" as const,
        accessSource: "workos_authoritative" as const,
      },
    },
    membership: {
      role: "admin" as const,
      accessSource: "workos_authoritative" as const,
    },
    activeTeam: null,
    capabilities: [],
  } satisfies ApiAuthContext;

  return {
    auth,
    glossary: input.glossary,
    actorUserId: input.actorUserId,
  };
}

async function loadGlossariesForSearch(
  input: GlossaryConcordanceSearchInput,
): Promise<AttachedGlossaryRecord[]> {
  if (input.glossaryIds && input.glossaryIds.length > 0) {
    return db
      .select()
      .from(schema.glossaries)
      .where(
        and(
          inArray(schema.glossaries.id, input.glossaryIds),
          eq(schema.glossaries.status, "active"),
          eq(schema.glossaries.source, "native"),
        ),
      );
  }

  if (!input.projectId) {
    return [];
  }

  return loadAttachedGlossaries(input.projectId);
}

async function resolveOrganizationId(
  input: GlossaryConcordanceSearchInput,
): Promise<string | undefined> {
  if (input.organizationId) {
    return input.organizationId;
  }

  if (!input.projectId) {
    return undefined;
  }

  const [project] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, input.projectId))
    .limit(1);

  return project?.organizationId;
}

async function loadAttachedGlossaries(projectId: string): Promise<AttachedGlossaryRecord[]> {
  const rows = await db
    .select({ glossary: schema.glossaries, projectSource: schema.projects.source })
    .from(schema.projectGlossaries)
    .innerJoin(schema.glossaries, eq(schema.projectGlossaries.glossaryId, schema.glossaries.id))
    .innerJoin(schema.projects, eq(schema.projectGlossaries.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.projectGlossaries.projectId, projectId),
        eq(schema.glossaries.status, "active"),
        or(eq(schema.projects.source, "external_tms"), eq(schema.glossaries.source, "native")),
      ),
    );

  return rows
    .filter((row) => shouldIncludeAttachedGlossary(row.projectSource, row.glossary))
    .map((row) => row.glossary);
}

export async function searchGlossaryConcordance(
  input: GlossaryConcordanceSearchInput,
): Promise<NormalizedGlossaryMatch[]> {
  const tsQuery = buildGlossaryTsQuery(input.sourceText);
  if (!tsQuery) {
    return [];
  }

  const limit = input.limit ?? 20;
  const organizationId = await resolveOrganizationId(input);
  if (!organizationId) {
    return [];
  }

  const attached = await loadGlossariesForSearch(input);
  const searchable = attached.filter(supportsConcordanceSearch);
  if (searchable.length === 0) {
    return [];
  }

  const concordanceCtx: GlossaryConcordanceContext = {
    organizationId,
    projectId: input.projectId ?? "",
    actorUserId: input.actorUserId,
  };

  const query: GlossaryConcordanceQuery = {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    sourceText: input.sourceText,
    limit,
  };

  const matchGroups = await Promise.all(
    searchable.map(async (glossary) => {
      try {
        const adapter = createGlossary(
          createConcordanceProviderContext({
            organizationId,
            actorUserId: input.actorUserId,
            glossary,
          }),
        );
        return adapter.searchConcordance(query, concordanceCtx);
      } catch (error) {
        glossaryLogger.error(
          { err: error, glossaryId: glossary.id, projectId: input.projectId ?? null },
          "Glossary concordance search failed for attached glossary",
        );
        return [];
      }
    }),
  );

  return mergeGlossaryMatches(matchGroups.flat(), limit);
}
