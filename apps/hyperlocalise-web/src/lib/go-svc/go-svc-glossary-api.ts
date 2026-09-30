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
import type {
  GlossaryConcept,
  GlossaryConceptPageQuery,
  GlossaryExportQuery,
  GlossaryProject,
  GlossaryRecord,
  GlossaryTerm,
  GlossaryTermPageQuery,
  GoSvcPageQuery,
  GoSvcRecord,
  GoSvcRequestOptions,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcGlossaryApi {
  readonly projects: GoSvcGlossaryProjectsApi;
  readonly concepts: GoSvcGlossaryConceptsApi;
  readonly terms: GoSvcGlossaryTermsApi;

  constructor(private readonly request: GoSvcRequest) {
    this.projects = new GoSvcGlossaryProjectsApi(request);
    this.concepts = new GoSvcGlossaryConceptsApi(request);
    this.terms = new GoSvcGlossaryTermsApi(request);
  }

  list(
    organizationSlug: string,
    query: GoSvcPageQuery & { search?: string; source?: "native" | "external_tms" } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ glossaries: GlossaryRecord[]; total: number }>(
      orgPath(organizationSlug, "glossaries"),
      { query, ...options },
    );
  }

  create(
    organizationSlug: string,
    body: {
      name: string;
      description?: string;
      sourceLocale: string;
      controlLevel?: "org" | "team";
      teamId?: string;
      projectIds?: string[];
      projectId?: string;
    },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ glossary: GlossaryRecord }>(
      orgPath(organizationSlug, "glossaries"),
      { method: "POST", body, ...options },
    );
  }

  get(organizationSlug: string, glossaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ glossary: GlossaryRecord; canContribute: boolean }>(
      orgPath(organizationSlug, "glossaries", glossaryId),
      options,
    );
  }

  update(
    organizationSlug: string,
    glossaryId: string,
    body: { name?: string; description?: string; sourceLocale?: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ glossary: GlossaryRecord; canContribute: boolean }>(
      orgPath(organizationSlug, "glossaries", glossaryId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(organizationSlug: string, glossaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "glossaries", glossaryId), {
      method: "DELETE",
      ...options,
    });
  }

  export(
    organizationSlug: string,
    glossaryId: string,
    query: GlossaryExportQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.download(orgPath(organizationSlug, "glossaries", glossaryId, "export"), {
      query,
      ...options,
    });
  }

  importReport(
    organizationSlug: string,
    glossaryId: string,
    reportId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "glossaries", glossaryId, "import-reports", reportId),
      options,
    );
  }

  importBackup(
    organizationSlug: string,
    glossaryId: string,
    reportId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.download(
      orgPath(organizationSlug, "glossaries", glossaryId, "import-reports", reportId, "backup"),
      options,
    );
  }
}

export class GoSvcGlossaryProjectsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, glossaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ projects: GlossaryProject[] }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "projects"),
      options,
    );
  }

  attach(
    organizationSlug: string,
    glossaryId: string,
    body: { projectId: string; priority?: number },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ projects: GlossaryProject[] }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "projects"),
      { method: "POST", body, ...options },
    );
  }

  detach(
    organizationSlug: string,
    glossaryId: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "glossaries", glossaryId, "projects", projectId),
      { method: "DELETE", ...options },
    );
  }
}

export class GoSvcGlossaryConceptsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, glossaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ concepts: GlossaryConcept[]; total: number }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts"),
      options,
    );
  }

  create(
    organizationSlug: string,
    glossaryId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ concept: GlossaryConcept }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts"),
      { method: "POST", body, ...options },
    );
  }

  get(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ concept: GlossaryConcept }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId),
      options,
    );
  }

  update(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ concept: GlossaryConcept }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId),
      { method: "DELETE", ...options },
    );
  }

  page(
    organizationSlug: string,
    glossaryId: string,
    query: GlossaryConceptPageQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", "page"),
      { query, ...options },
    );
  }

  authors(organizationSlug: string, glossaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", "authors"),
      options,
    );
  }

  history(
    organizationSlug: string,
    glossaryId: string,
    query: { cursor?: string; limit?: number; conceptId?: string; eventType?: string } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", "history"),
      { query, ...options },
    );
  }

  import(
    organizationSlug: string,
    glossaryId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", "import"),
      { method: "POST", body, ...options },
    );
  }
}

export class GoSvcGlossaryTermsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ terms: GlossaryTerm[]; total: number }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId, "terms"),
      options,
    );
  }

  page(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    query: GlossaryTermPageQuery = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId, "terms", "page"),
      { query, ...options },
    );
  }

  create(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ term: GlossaryTerm }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId, "terms"),
      { method: "POST", body, ...options },
    );
  }

  update(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    termId: string,
    body: GoSvcRecord,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ term: GlossaryTerm }>(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId, "terms", termId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(
    organizationSlug: string,
    glossaryId: string,
    conceptId: string,
    termId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "glossaries", glossaryId, "concepts", conceptId, "terms", termId),
      { method: "DELETE", ...options },
    );
  }
}
