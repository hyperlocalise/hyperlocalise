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
import { delay, http, HttpResponse } from "msw";

import type {
  GlossaryConceptRecord,
  GlossaryProjectRecord,
  GlossaryRecord,
} from "@/api/routes/glossary/glossary.schema";

export function createGlossaryDetailMswHandlers({
  glossary,
  concepts,
  attachedProjects = [],
  projects = [],
  conceptsLoading = false,
  onConceptUpdate,
  onTermDelete,
}: {
  glossary: GlossaryRecord;
  concepts: GlossaryConceptRecord[];
  attachedProjects?: GlossaryProjectRecord[];
  projects?: Array<{ id: string; name: string; sourceLocale: string }>;
  conceptsLoading?: boolean;
  onConceptUpdate?: (termIds: string[]) => void;
  onTermDelete?: (termId: string) => void;
}) {
  let currentGlossary = glossary;
  let currentConcepts = concepts;

  return [
    http.get("/api/orgs/:organizationSlug/glossaries/:glossaryId", () =>
      HttpResponse.json({ glossary: currentGlossary }),
    ),
    http.patch("/api/orgs/:organizationSlug/glossaries/:glossaryId", async ({ request }) => {
      const body = (await request.json()) as { name?: string };
      currentGlossary = {
        ...currentGlossary,
        ...(body.name !== undefined ? { name: body.name } : {}),
      };
      return HttpResponse.json({
        glossary: currentGlossary,
      });
    }),
    http.delete(
      "/api/orgs/:organizationSlug/glossaries/:glossaryId",
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get("/api/orgs/:organizationSlug/glossaries/:glossaryId/concepts", async () => {
      if (conceptsLoading) await delay("infinite");
      return HttpResponse.json({
        concepts: currentConcepts,
        total: currentConcepts.length,
      });
    }),
    http.patch(
      "/api/orgs/:organizationSlug/glossaries/:glossaryId/concepts/:conceptId",
      async ({ params, request }) => {
        const body = (await request.json()) as {
          primaryTerm?: string;
          terms?: Array<{ id?: string }>;
        };
        const conceptId = String(params.conceptId);
        const currentConcept = currentConcepts.find((concept) => concept.id === conceptId);
        if (!currentConcept) return HttpResponse.json({ error: "not_found" }, { status: 404 });

        const termIds = new Set((body.terms ?? []).flatMap((term) => (term.id ? [term.id] : [])));
        currentConcepts = currentConcepts.map((concept) =>
          concept.id === conceptId
            ? {
                ...concept,
                primaryTerm: body.primaryTerm ?? concept.primaryTerm,
                terms: concept.terms.filter((term) => termIds.has(term.id)),
              }
            : concept,
        );
        onConceptUpdate?.(body.terms?.flatMap((term) => (term.id ? [term.id] : [])) ?? []);
        return HttpResponse.json({
          concept: currentConcepts.find((concept) => concept.id === conceptId),
        });
      },
    ),
    http.delete(
      "/api/orgs/:organizationSlug/glossaries/:glossaryId/concepts/:conceptId/terms/:termId",
      ({ params }) => {
        onTermDelete?.(String(params.termId));
        return new HttpResponse(null, { status: 204 });
      },
    ),
    http.get("/api/orgs/:organizationSlug/glossaries/:glossaryId/projects", () =>
      HttpResponse.json({ projects: attachedProjects }),
    ),
    http.get("/api/orgs/:organizationSlug/projects", () => HttpResponse.json({ projects })),
  ];
}
