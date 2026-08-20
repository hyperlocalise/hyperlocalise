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
}: {
  glossary: GlossaryRecord;
  concepts: GlossaryConceptRecord[];
  attachedProjects?: GlossaryProjectRecord[];
  projects?: Array<{ id: string; name: string; sourceLocale: string }>;
  conceptsLoading?: boolean;
}) {
  let currentGlossary = glossary;

  return [
    http.get("/api/orgs/:organizationSlug/glossaries/:glossaryId", () =>
      HttpResponse.json({ glossary: currentGlossary }),
    ),
    http.patch("/api/orgs/:organizationSlug/glossaries/:glossaryId", async ({ request }) => {
      const body = (await request.json()) as { name?: string };
      currentGlossary = { ...currentGlossary, name: body.name ?? currentGlossary.name };
      return HttpResponse.json({
        glossary: currentGlossary,
      });
    }),
    http.get("/api/orgs/:organizationSlug/glossaries/:glossaryId/concepts", async () => {
      if (conceptsLoading) await delay("infinite");
      return HttpResponse.json({ concepts, total: concepts.length });
    }),
    http.get("/api/orgs/:organizationSlug/glossaries/:glossaryId/projects", () =>
      HttpResponse.json({ projects: attachedProjects }),
    ),
    http.get("/api/orgs/:organizationSlug/projects", () => HttpResponse.json({ projects })),
  ];
}
