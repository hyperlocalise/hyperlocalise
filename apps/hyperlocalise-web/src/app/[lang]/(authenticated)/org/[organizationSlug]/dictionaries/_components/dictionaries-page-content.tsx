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
import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { createDictionaryClient } from "@/lib/spellcheck-dictionary/client";

import {
  DictionariesPageStoreProvider,
  useDictionariesPageStore,
} from "../store/dictionaries-store-context";
import { dictionariesPageContentMessages } from "./dictionaries-page-content.messages";
import { DictionariesPageView } from "./dictionaries-page-view";
import { filterDictionaryListRows, type ApiDictionary } from "./dictionary-list";

const DICTIONARIES_PAGE_SIZE = 100;

export function DictionariesPageContent({
  organizationSlug,
  canWriteDictionaries,
}: {
  organizationSlug: string;
  canWriteDictionaries: boolean;
}) {
  return (
    <DictionariesPageStoreProvider organizationSlug={organizationSlug}>
      <DictionariesPageContentView canWriteDictionaries={canWriteDictionaries} />
    </DictionariesPageStoreProvider>
  );
}

const DictionariesPageContentView = observer(function DictionariesPageContentView({
  canWriteDictionaries,
}: {
  canWriteDictionaries: boolean;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const pageStore = useDictionariesPageStore();
  const { client: goSvcClient } = useGoSvcClient();
  const dictionaryClient = useMemo(() => createDictionaryClient(goSvcClient), [goSvcClient]);

  const dictionariesQuery = useInfiniteQuery({
    queryKey: ["spellcheck-dictionaries", pageStore.organizationSlug],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      try {
        const response = await dictionaryClient.list({
          param: { organizationSlug: pageStore.organizationSlug },
          query: {
            limit: String(DICTIONARIES_PAGE_SIZE),
            offset: String(pageParam),
          },
        });
        return {
          dictionaries: (response.dictionaries ?? []) as ApiDictionary[],
          total: Number(response.total ?? 0),
          offset: pageParam,
        };
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionariesPageContentMessages.loadFailed)),
          { cause: error },
        );
      }
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

  const filteredDictionaries = filterDictionaryListRows(dictionaries, pageStore.searchQuery);

  const createDictionary = useMutation({
    mutationFn: async () => {
      try {
        return await dictionaryClient.create({
          param: { organizationSlug: pageStore.organizationSlug },
          json: {
            name: pageStore.createForm.name.trim(),
            description: pageStore.createForm.description.trim() || undefined,
          },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(dictionariesPageContentMessages.createFailed),
          ),
          { cause: error },
        );
      }
    },
    onSuccess: (body) => {
      pageStore.resetCreateDialog();
      router.push(`/org/${pageStore.organizationSlug}/dictionaries/${body.dictionary.id}`);
    },
    onError: (error) => {
      const message = goSvcErrorMessage(
        error,
        intl.formatMessage(dictionariesPageContentMessages.createFailed),
      );
      pageStore.setCreateErrors({ ...pageStore.createErrors, submit: message });
      toast.error(message);
    },
  });

  function onSubmitCreateDictionary() {
    if (!pageStore.createForm.name.trim()) {
      pageStore.setCreateErrors({
        name: intl.formatMessage(dictionariesPageContentMessages.nameRequired),
      });
      return;
    }
    pageStore.setCreateErrors({});
    createDictionary.mutate();
  }

  return (
    <DictionariesPageView
      organizationSlug={pageStore.organizationSlug}
      dictionaries={filteredDictionaries}
      isLoading={dictionariesQuery.isLoading}
      isError={dictionariesQuery.isError}
      isSuccess={dictionariesQuery.isSuccess}
      error={dictionariesQuery.error instanceof Error ? dictionariesQuery.error : null}
      canWriteDictionaries={canWriteDictionaries}
      searchQuery={pageStore.searchQuery}
      onSearchQueryChange={(value) => pageStore.setSearchQuery(value)}
      createDialogOpen={pageStore.createDialogOpen}
      onCreateDialogOpenChange={(open) => pageStore.setCreateDialogOpen(open)}
      createForm={pageStore.createForm}
      onCreateFormChange={(form) => pageStore.setCreateForm(form)}
      createErrors={pageStore.createErrors}
      isCreating={createDictionary.isPending}
      onSubmitCreateDictionary={onSubmitCreateDictionary}
      totalCount={dictionariesQuery.data?.pages[0]?.total}
      hasNextPage={dictionariesQuery.hasNextPage}
      isFetchingNextPage={dictionariesQuery.isFetchingNextPage}
      onLoadMore={() => void dictionariesQuery.fetchNextPage()}
    />
  );
});
