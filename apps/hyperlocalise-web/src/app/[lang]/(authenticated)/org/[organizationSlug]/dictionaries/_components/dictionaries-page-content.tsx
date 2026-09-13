"use client";

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
import { useMemo, useState } from "react";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { filterDictionaryListRows, type ApiDictionary } from "./dictionary-list";
import { DictionariesPageView, type DictionaryCreateForm } from "./dictionaries-page-view";
import { dictionariesPageContentMessages } from "./dictionaries-page-content.messages";

const DICTIONARIES_PAGE_SIZE = 100;

function createEmptyForm(): DictionaryCreateForm {
  return { name: "", description: "" };
}

export function DictionariesPageContent({
  organizationSlug,
  canWriteDictionaries,
}: {
  organizationSlug: string;
  canWriteDictionaries: boolean;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<DictionaryCreateForm>(createEmptyForm);
  const [createErrors, setCreateErrors] = useState<{ name?: string }>({});

  const dictionariesQuery = useInfiniteQuery({
    queryKey: ["spellcheck-dictionaries", organizationSlug],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries.$get({
        param: { organizationSlug },
        query: {
          limit: String(DICTIONARIES_PAGE_SIZE),
          offset: String(pageParam),
        },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(dictionariesPageContentMessages.loadFailed),
        );
      }
      const body = await response.json();
      return {
        dictionaries: (body.dictionaries ?? []) as ApiDictionary[],
        total: Number(body.total ?? 0),
        offset: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.dictionaries.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
  });
  const dictionaries = useMemo(
    () => dictionariesQuery.data?.pages.flatMap((page) => page.dictionaries) ?? [],
    [dictionariesQuery.data?.pages],
  );

  const filteredDictionaries = useMemo(
    () => filterDictionaryListRows(dictionaries, searchQuery),
    [dictionaries, searchQuery],
  );

  const createDictionary = useMutation({
    mutationFn: async (form: DictionaryCreateForm) => {
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries.$post({
        param: { organizationSlug },
        json: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(dictionariesPageContentMessages.createFailed),
        );
      }
      return response.json();
    },
    onSuccess: (body) => {
      setCreateDialogOpen(false);
      setCreateForm(createEmptyForm());
      router.push(`/org/${organizationSlug}/dictionaries/${body.dictionary.id}`);
    },
  });

  function onSubmitCreateDictionary() {
    if (!createForm.name.trim()) {
      setCreateErrors({
        name: intl.formatMessage(dictionariesPageContentMessages.nameRequired),
      });
      return;
    }
    setCreateErrors({});
    createDictionary.mutate(createForm);
  }

  return (
    <DictionariesPageView
      organizationSlug={organizationSlug}
      dictionaries={filteredDictionaries}
      isLoading={dictionariesQuery.isLoading}
      isError={dictionariesQuery.isError}
      isSuccess={dictionariesQuery.isSuccess}
      error={dictionariesQuery.error instanceof Error ? dictionariesQuery.error : null}
      canWriteDictionaries={canWriteDictionaries}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      createDialogOpen={createDialogOpen}
      onCreateDialogOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) {
          setCreateErrors({});
        }
      }}
      createForm={createForm}
      onCreateFormChange={setCreateForm}
      createErrors={createErrors}
      isCreating={createDictionary.isPending}
      onSubmitCreateDictionary={onSubmitCreateDictionary}
      totalCount={dictionariesQuery.data?.pages[0]?.total}
      hasNextPage={dictionariesQuery.hasNextPage}
      isFetchingNextPage={dictionariesQuery.isFetchingNextPage}
      onLoadMore={() => void dictionariesQuery.fetchNextPage()}
    />
  );
}
