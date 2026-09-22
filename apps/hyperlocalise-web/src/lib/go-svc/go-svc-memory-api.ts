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
  GoSvcPageQuery,
  GoSvcRecord,
  GoSvcRequestOptions,
  MemoryEntry,
  MemoryProject,
  MemoryRecord,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcMemoryApi {
  readonly projects: GoSvcMemoryProjectsApi;
  readonly entries: GoSvcMemoryEntriesApi;
  readonly importAttempts: GoSvcMemoryImportAttemptsApi;

  constructor(private readonly request: GoSvcRequest) {
    this.projects = new GoSvcMemoryProjectsApi(request);
    this.entries = new GoSvcMemoryEntriesApi(request);
    this.importAttempts = new GoSvcMemoryImportAttemptsApi(request);
  }

  list(
    organizationSlug: string,
    query: GoSvcPageQuery & { projectId?: string } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ memories: MemoryRecord[]; total: number }>(
      orgPath(organizationSlug, "translation-memories"),
      { query, ...options },
    );
  }

  create(
    organizationSlug: string,
    body: { name: string; description?: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ memory: MemoryRecord }>(
      orgPath(organizationSlug, "translation-memories"),
      { method: "POST", body, ...options },
    );
  }

  get(organizationSlug: string, memoryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ memory: MemoryRecord }>(
      orgPath(organizationSlug, "translation-memories", memoryId),
      options,
    );
  }

  update(
    organizationSlug: string,
    memoryId: string,
    body: { name?: string; description?: string; status?: "active" | "draft" | "archived" },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ memory: MemoryRecord }>(
      orgPath(organizationSlug, "translation-memories", memoryId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(organizationSlug: string, memoryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "translation-memories", memoryId), {
      method: "DELETE",
      ...options,
    });
  }
}

export class GoSvcMemoryProjectsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, memoryId: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ projects: MemoryProject[] }>(
      orgPath(organizationSlug, "translation-memories", memoryId, "projects"),
      options,
    );
  }

  attach(
    organizationSlug: string,
    memoryId: string,
    body: { projectId: string; priority?: number },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ projects: MemoryProject[] }>(
      orgPath(organizationSlug, "translation-memories", memoryId, "projects"),
      { method: "POST", body, ...options },
    );
  }

  detach(
    organizationSlug: string,
    memoryId: string,
    projectId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "translation-memories", memoryId, "projects", projectId),
      { method: "DELETE", ...options },
    );
  }
}

export class GoSvcMemoryEntriesApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(
    organizationSlug: string,
    memoryId: string,
    query: GoSvcPageQuery & { search?: string } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{
      memoryEntries: MemoryEntry[];
      total: number;
      nextCursor: string | null;
      pagination: { limit: number; returned: number; hasMore: boolean };
    }>(orgPath(organizationSlug, "translation-memories", memoryId, "entries"), {
      query,
      ...options,
    });
  }

  create(
    organizationSlug: string,
    memoryId: string,
    body: {
      sourceLocale: string;
      targetLocale: string;
      sourceText: string;
      targetText: string;
      matchScore?: number;
    },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ memoryEntry: MemoryEntry }>(
      orgPath(organizationSlug, "translation-memories", memoryId, "entries"),
      { method: "POST", body, ...options },
    );
  }

  get(
    organizationSlug: string,
    memoryId: string,
    entryId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ memoryEntry: MemoryEntry }>(
      orgPath(organizationSlug, "translation-memories", memoryId, "entries", entryId),
      options,
    );
  }

  update(
    organizationSlug: string,
    memoryId: string,
    entryId: string,
    body: GoSvcRecord & { expectedVersion: number },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{ memoryEntry: MemoryEntry }>(
      orgPath(organizationSlug, "translation-memories", memoryId, "entries", entryId),
      { method: "PATCH", body, ...options },
    );
  }

  delete(
    organizationSlug: string,
    memoryId: string,
    entryId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.empty(
      orgPath(organizationSlug, "translation-memories", memoryId, "entries", entryId),
      { method: "DELETE", ...options },
    );
  }

  import(
    organizationSlug: string,
    memoryId: string,
    body: GoSvcRecord & { format: "csv" | "tmx"; content: string },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "translation-memories", memoryId, "entries", "import"),
      { method: "POST", body, ...options },
    );
  }

  export(
    organizationSlug: string,
    memoryId: string,
    query: {
      format?: "csv" | "tmx";
      sourceLocale?: string;
      targetLocale?: string;
    } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.download(
      orgPath(organizationSlug, "translation-memories", memoryId, "entries", "export"),
      { query, ...options },
    );
  }

  promoteFromProject(
    organizationSlug: string,
    memoryId: string,
    body: {
      projectId: string;
      sourceLocale: string;
      targetLocale?: string;
      sourcePath?: string;
    },
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(
        organizationSlug,
        "translation-memories",
        memoryId,
        "entries",
        "promote-from-project",
      ),
      { method: "POST", body, ...options },
    );
  }
}

export class GoSvcMemoryImportAttemptsApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(
    organizationSlug: string,
    memoryId: string,
    query: { cursor?: string; limit?: number } = {},
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<{
      memoryImportAttempts: GoSvcRecord[];
      nextCursor: string | null;
      total: number;
      pagination: { limit: number; returned: number; hasMore: boolean };
    }>(orgPath(organizationSlug, "translation-memories", memoryId, "import-attempts"), {
      query,
      ...options,
    });
  }

  get(
    organizationSlug: string,
    memoryId: string,
    attemptId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.json<GoSvcRecord>(
      orgPath(organizationSlug, "translation-memories", memoryId, "import-attempts", attemptId),
      options,
    );
  }

  report(
    organizationSlug: string,
    memoryId: string,
    attemptId: string,
    options: GoSvcRequestOptions = {},
  ) {
    return this.request.download(
      orgPath(
        organizationSlug,
        "translation-memories",
        memoryId,
        "import-attempts",
        attemptId,
        "report",
      ),
      options,
    );
  }
}
