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
export type DictionaryRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  description: string;
  status: "active" | "draft" | "archived";
  wordsVersion: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};
export type DictionaryWord = { id: string; locale: string; word: string; createdAt: string };
export type DictionaryProject = { projectId: string; projectName: string; priority: number };
type OrgParams = { organizationSlug: string };
type DictionaryParams = OrgParams & { dictionaryId: string };
type ProjectParams = OrgParams & { projectId: string };
type PageQuery = { limit?: string; offset?: string };
type DictionaryResponse<T> = Omit<Response, "json"> & { json(): Promise<T> };
type RequestInput<P, B, Q> = { param: P } & ([B] extends [never] ? {} : { json: B }) &
  ([Q] extends [never] ? {} : { query?: Q });

function endpoint<P extends OrgParams, B, Q, T>(method: string, path: string) {
  return async (input: RequestInput<P, B, Q>): Promise<DictionaryResponse<T>> => {
    const pathname = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      const value = (input.param as Record<string, string>)[key];
      if (!value) throw new Error(`Missing dictionary path parameter: ${key}`);
      return encodeURIComponent(value);
    });
    const search = new URLSearchParams();
    if ("query" in input && input.query) {
      for (const [key, value] of Object.entries(input.query)) {
        if (typeof value === "string") search.set(key, value);
      }
    }
    const query = search.size ? `?${search}` : "";
    return fetch(
      `/api/go-svc/v1/orgs/:organizationSlug${pathname}`.replace(
        ":organizationSlug",
        encodeURIComponent(input.param.organizationSlug),
      ) + query,
      {
        method,
        credentials: "same-origin",
        ...("json" in input
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.json) }
          : {}),
      },
    ) as Promise<DictionaryResponse<T>>;
  };
}

export const dictionaryClient = {
  list: endpoint<
    OrgParams,
    never,
    PageQuery & { projectId?: string },
    { dictionaries: DictionaryRecord[]; total: number }
  >("GET", "/dictionaries"),
  create: endpoint<
    OrgParams,
    { name: string; description?: string },
    never,
    { dictionary: DictionaryRecord }
  >("POST", "/dictionaries"),
  get: endpoint<DictionaryParams, never, never, { dictionary: DictionaryRecord }>(
    "GET",
    "/dictionaries/:dictionaryId",
  ),
  update: endpoint<
    DictionaryParams,
    { name?: string; description?: string; status?: DictionaryRecord["status"] },
    never,
    { dictionary: DictionaryRecord }
  >("PATCH", "/dictionaries/:dictionaryId"),
  remove: endpoint<DictionaryParams, never, never, never>("DELETE", "/dictionaries/:dictionaryId"),
  words: endpoint<
    DictionaryParams,
    never,
    PageQuery & { locale?: string },
    { words: DictionaryWord[]; total: number }
  >("GET", "/dictionaries/:dictionaryId/words"),
  addWord: endpoint<
    DictionaryParams,
    { locale: string; word: string },
    never,
    { word: DictionaryWord }
  >("POST", "/dictionaries/:dictionaryId/words"),
  removeWord: endpoint<DictionaryParams & { wordId: string }, never, never, never>(
    "DELETE",
    "/dictionaries/:dictionaryId/words/:wordId",
  ),
  importWords: endpoint<
    DictionaryParams,
    { locale: string; content: string },
    never,
    { import: { imported: number; skipped: number } }
  >("POST", "/dictionaries/:dictionaryId/words/import"),
  exportWords: endpoint<DictionaryParams, never, { locale: string }, never>(
    "GET",
    "/dictionaries/:dictionaryId/words/export",
  ),
  projects: endpoint<DictionaryParams, never, never, { projects: DictionaryProject[] }>(
    "GET",
    "/dictionaries/:dictionaryId/projects",
  ),
  attachProject: endpoint<
    DictionaryParams,
    { projectId: string; priority?: number },
    never,
    { projects: DictionaryProject[] }
  >("POST", "/dictionaries/:dictionaryId/projects"),
  detachProject: endpoint<DictionaryParams & { projectId: string }, never, never, never>(
    "DELETE",
    "/dictionaries/:dictionaryId/projects/:projectId",
  ),
  projectDictionaries: endpoint<
    ProjectParams,
    never,
    never,
    { dictionaries: (DictionaryRecord & { priority: number })[] }
  >("GET", "/projects/:projectId/dictionaries"),
  attachDictionary: endpoint<
    ProjectParams,
    { dictionaryId: string; priority?: number },
    never,
    { dictionary: DictionaryRecord & { priority: number } }
  >("POST", "/projects/:projectId/dictionaries"),
  detachDictionary: endpoint<ProjectParams & { dictionaryId: string }, never, never, never>(
    "DELETE",
    "/projects/:projectId/dictionaries/:dictionaryId",
  ),
  resolvedWords: endpoint<
    ProjectParams,
    never,
    { locale: string },
    { locale: string; words: string[]; wordsVersion: string; dictionaryIds: string[] }
  >("GET", "/projects/:projectId/dictionaries/resolved"),
};
