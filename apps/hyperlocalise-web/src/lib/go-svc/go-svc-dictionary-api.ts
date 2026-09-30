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
  DictionaryProject,
  DictionaryRecord,
  DictionaryWord,
  GoSvcPageQuery,
  GoSvcRequestOptions,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcDictionaryApi {
  readonly words: GoSvcDictionaryWordsApi;
  readonly projects: GoSvcDictionaryProjectsApi;
  readonly project: GoSvcProjectDictionariesApi;

  constructor(private readonly request: GoSvcRequest) {
    this.words = new GoSvcDictionaryWordsApi(request);
    this.projects = new GoSvcDictionaryProjectsApi(request);
    this.project = new GoSvcProjectDictionariesApi(request);
  }

  list(
    organizationSlug: string,
    query: GoSvcPageQuery & { projectId?: string } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ dictionaries: DictionaryRecord[]; total: number }>(
      orgPath(organizationSlug, "dictionaries"),
      { query, ...options },
    );
  }

  create(
    organizationSlug: string,
    body: { name: string; description?: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ dictionary: DictionaryRecord }>(
      orgPath(organizationSlug, "dictionaries"),
      { method: "POST", body, ...options },
    );
  }

  get(organizationSlug: string, dictionaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ dictionary: DictionaryRecord }>(
      orgPath(organizationSlug, "dictionaries", dictionaryId),
      options,
    );
  }

  update(
    organizationSlug: string,
    dictionaryId: string,
    body: { name?: string; description?: string; status?: DictionaryRecord["status"] },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ dictionary: DictionaryRecord }>(
      orgPath(organizationSlug, "dictionaries", dictionaryId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(organizationSlug: string, dictionaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "dictionaries", dictionaryId), {
      method: "DELETE",
      ...options,
    });
  }
}

export class GoSvcDictionaryWordsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(
    organizationSlug: string,
    dictionaryId: string,
    query: GoSvcPageQuery & { locale?: string } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ words: DictionaryWord[]; total: number }>(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "words"),
      { query, ...options },
    );
  }

  add(
    organizationSlug: string,
    dictionaryId: string,
    body: { locale: string; word: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ word: DictionaryWord }>(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "words"),
      { method: "POST", body, ...options },
    );
  }

  delete(
    organizationSlug: string,
    dictionaryId: string,
    wordId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "words", wordId),
      { method: "DELETE", ...options },
    );
  }

  import(
    organizationSlug: string,
    dictionaryId: string,
    body: { locale: string; content: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ import: { imported: number; skipped: number } }>(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "words", "import"),
      { method: "POST", body, ...options },
    );
  }

  export(
    organizationSlug: string,
    dictionaryId: string,
    locale: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.download(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "words", "export"),
      { query: { locale }, ...options },
    );
  }
}

export class GoSvcDictionaryProjectsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, dictionaryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ projects: DictionaryProject[] }>(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "projects"),
      options,
    );
  }

  attach(
    organizationSlug: string,
    dictionaryId: string,
    body: { projectId: string; priority?: number },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ projects: DictionaryProject[] }>(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "projects"),
      { method: "POST", body, ...options },
    );
  }

  detach(
    organizationSlug: string,
    dictionaryId: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "dictionaries", dictionaryId, "projects", projectId),
      { method: "DELETE", ...options },
    );
  }
}

export class GoSvcProjectDictionariesApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, projectId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ dictionaries: (DictionaryRecord & { priority: number })[] }>(
      orgPath(organizationSlug, "projects", projectId, "dictionaries"),
      options,
    );
  }

  attach(
    organizationSlug: string,
    projectId: string,
    body: { dictionaryId: string; priority?: number },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ dictionary: DictionaryRecord & { priority: number } }>(
      orgPath(organizationSlug, "projects", projectId, "dictionaries"),
      { method: "POST", body, ...options },
    );
  }

  detach(
    organizationSlug: string,
    projectId: string,
    dictionaryId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "projects", projectId, "dictionaries", dictionaryId),
      { method: "DELETE", ...options },
    );
  }

  resolvedWords(
    organizationSlug: string,
    projectId: string,
    locale: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{
      locale: string;
      words: string[];
      wordsVersion: string;
      dictionaryIds: string[];
    }>(orgPath(organizationSlug, "projects", projectId, "dictionaries", "resolved"), {
      query: { locale },
      ...options,
    });
  }
}
