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
import { createContext, use, useCallback, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { spellcheckDictionaryContextMessages } from "./spellcheck-dictionary-context.messages";

export type AttachedSpellcheckDictionary = {
  id: string;
  name: string;
  status: string;
  priority: number;
};

export type SpellcheckDictionaryContextValue = {
  acceptedWords: string[];
  defaultDictionaryId: string | null;
  canAddWords: boolean;
  addWord: (word: string) => Promise<void>;
  isAdding: boolean;
};

const SpellcheckDictionaryContext = createContext<SpellcheckDictionaryContextValue>({
  acceptedWords: [],
  defaultDictionaryId: null,
  canAddWords: false,
  addWord: async () => undefined,
  isAdding: false,
});

export function useSpellcheckDictionaryContext() {
  return use(SpellcheckDictionaryContext);
}

export function useProjectSpellcheckDictionary(input: {
  organizationSlug: string;
  projectId: string;
  locale: string;
}): SpellcheckDictionaryContextValue {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const trimmedLocale = input.locale.trim();

  const resolvedQuery = useQuery({
    queryKey: ["project-spellcheck-words", input.organizationSlug, input.projectId, trimmedLocale],
    enabled: Boolean(input.organizationSlug && input.projectId && trimmedLocale),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].dictionaries.resolved.$get({
        param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
        query: { locale: trimmedLocale },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(spellcheckDictionaryContextMessages.loadFailed),
        );
      }
      return response.json();
    },
  });

  const attachmentsQuery = useQuery({
    queryKey: ["project-spellcheck-dictionaries", input.organizationSlug, input.projectId],
    enabled: Boolean(input.organizationSlug && input.projectId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].dictionaries.$get({
        param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(spellcheckDictionaryContextMessages.loadFailed),
        );
      }
      const body = await response.json();
      return (body.dictionaries ?? []) as AttachedSpellcheckDictionary[];
    },
  });

  const defaultDictionary = useMemo(() => {
    const attached = (attachmentsQuery.data ?? []).filter(
      (dictionary) => dictionary.status === "active",
    );
    return attached[0] ?? null;
  }, [attachmentsQuery.data]);

  const addMutation = useMutation({
    mutationFn: async (word: string) => {
      if (!defaultDictionary) {
        throw new Error(intl.formatMessage(spellcheckDictionaryContextMessages.noDictionary));
      }

      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].words.$post({
        param: { organizationSlug: input.organizationSlug, dictionaryId: defaultDictionary.id },
        json: { locale: trimmedLocale, word },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(spellcheckDictionaryContextMessages.addFailed),
          ),
        );
      }
      return { word, dictionaryName: defaultDictionary.name };
    },
    onSuccess: async (result) => {
      toast.success(
        intl.formatMessage(spellcheckDictionaryContextMessages.addSuccess, {
          word: result.word,
          dictionary: result.dictionaryName,
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: ["project-spellcheck-words", input.organizationSlug, input.projectId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(spellcheckDictionaryContextMessages.addFailed),
      );
    },
  });

  const addWord = useCallback(
    async (word: string) => {
      await addMutation.mutateAsync(word);
    },
    [addMutation],
  );

  return useMemo(
    () => ({
      acceptedWords: resolvedQuery.data?.words ?? [],
      defaultDictionaryId: defaultDictionary?.id ?? null,
      canAddWords: Boolean(defaultDictionary),
      addWord,
      isAdding: addMutation.isPending,
    }),
    [addMutation.isPending, addWord, defaultDictionary, resolvedQuery.data?.words],
  );
}

export function SpellcheckDictionaryProvider({
  value,
  children,
}: {
  value: SpellcheckDictionaryContextValue;
  children: ReactNode;
}) {
  return (
    <SpellcheckDictionaryContext.Provider value={value}>
      {children}
    </SpellcheckDictionaryContext.Provider>
  );
}
