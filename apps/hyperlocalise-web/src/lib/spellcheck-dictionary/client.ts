/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type {
  DictionaryProject,
  DictionaryRecord,
  DictionaryWord,
} from "@/lib/go-svc/go-svc-client.types";

export type { DictionaryProject, DictionaryRecord, DictionaryWord };

type OrgParams = { organizationSlug: string };
type DictionaryParams = OrgParams & { dictionaryId: string };
type ProjectParams = OrgParams & { projectId: string };
type PageQuery = { limit?: string; offset?: string };

function pageQuery(query: PageQuery) {
  return {
    ...(query.limit ? { limit: Number(query.limit) } : {}),
    ...(query.offset ? { offset: Number(query.offset) } : {}),
  };
}

export function createDictionaryClient(goSvcClient: GoSvcClient) {
  return {
    list: ({
      param,
      query = {},
    }: {
      param: OrgParams;
      query?: PageQuery & { projectId?: string };
    }) =>
      goSvcClient.dictionary.list(param.organizationSlug, {
        ...pageQuery(query),
        ...(query.projectId ? { projectId: query.projectId } : {}),
      }),

    create: ({ param, json }: { param: OrgParams; json: { name: string; description?: string } }) =>
      goSvcClient.dictionary.create(param.organizationSlug, json),

    get: ({ param }: { param: DictionaryParams }) =>
      goSvcClient.dictionary.get(param.organizationSlug, param.dictionaryId),

    update: ({
      param,
      json,
    }: {
      param: DictionaryParams;
      json: { name?: string; description?: string; status?: DictionaryRecord["status"] };
    }) => goSvcClient.dictionary.update(param.organizationSlug, param.dictionaryId, json),

    remove: ({ param }: { param: DictionaryParams }) =>
      goSvcClient.dictionary.delete(param.organizationSlug, param.dictionaryId),

    words: ({
      param,
      query = {},
    }: {
      param: DictionaryParams;
      query?: PageQuery & { locale?: string };
    }) =>
      goSvcClient.dictionary.words.list(param.organizationSlug, param.dictionaryId, {
        ...pageQuery(query),
        ...(query.locale ? { locale: query.locale } : {}),
      }),

    addWord: ({
      param,
      json,
    }: {
      param: DictionaryParams;
      json: { locale: string; word: string };
    }) => goSvcClient.dictionary.words.add(param.organizationSlug, param.dictionaryId, json),

    removeWord: ({ param }: { param: DictionaryParams & { wordId: string } }) =>
      goSvcClient.dictionary.words.delete(param.organizationSlug, param.dictionaryId, param.wordId),

    importWords: ({
      param,
      json,
    }: {
      param: DictionaryParams;
      json: { locale: string; content: string };
    }) => goSvcClient.dictionary.words.import(param.organizationSlug, param.dictionaryId, json),

    exportWords: ({ param, query }: { param: DictionaryParams; query: { locale: string } }) =>
      goSvcClient.dictionary.words.export(param.organizationSlug, param.dictionaryId, query.locale),

    projects: ({ param }: { param: DictionaryParams }) =>
      goSvcClient.dictionary.projects.list(param.organizationSlug, param.dictionaryId),

    attachProject: ({
      param,
      json,
    }: {
      param: DictionaryParams;
      json: { projectId: string; priority?: number };
    }) => goSvcClient.dictionary.projects.attach(param.organizationSlug, param.dictionaryId, json),

    detachProject: ({ param }: { param: DictionaryParams & { projectId: string } }) =>
      goSvcClient.dictionary.projects.detach(
        param.organizationSlug,
        param.dictionaryId,
        param.projectId,
      ),

    projectDictionaries: ({ param }: { param: ProjectParams }) =>
      goSvcClient.dictionary.project.list(param.organizationSlug, param.projectId),

    attachDictionary: ({
      param,
      json,
    }: {
      param: ProjectParams;
      json: { dictionaryId: string; priority?: number };
    }) => goSvcClient.dictionary.project.attach(param.organizationSlug, param.projectId, json),

    detachDictionary: ({ param }: { param: ProjectParams & { dictionaryId: string } }) =>
      goSvcClient.dictionary.project.detach(
        param.organizationSlug,
        param.projectId,
        param.dictionaryId,
      ),

    resolvedWords: ({ param, query }: { param: ProjectParams; query: { locale: string } }) =>
      goSvcClient.dictionary.project.resolvedWords(
        param.organizationSlug,
        param.projectId,
        query.locale,
      ),
  };
}
