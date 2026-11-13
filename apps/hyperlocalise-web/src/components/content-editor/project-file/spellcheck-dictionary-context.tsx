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

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { createDictionaryClient } from "@/lib/spellcheck-dictionary/client";

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
  canWriteDictionaries?: boolean;
}): SpellcheckDictionaryContextValue {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const dictionaryClient = useMemo(() => createDictionaryClient(goSvcClient), [goSvcClient]);
  const trimmedLocale = input.locale.trim();

  const resolvedQuery = useQuery({
    queryKey: ["project-spellcheck-words", input.organizationSlug, input.projectId, trimmedLocale],
    enabled: Boolean(input.organizationSlug && input.projectId && trimmedLocale),
    queryFn: async () => {
      try {
        return await dictionaryClient.resolvedWords({
          param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
          query: { locale: trimmedLocale },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(spellcheckDictionaryContextMessages.loadFailed),
          ),
          { cause: error },
        );
      }
    },
  });

  const attachmentsQuery = useQuery({
    queryKey: ["project-spellcheck-dictionaries", input.organizationSlug, input.projectId],
    enabled: Boolean(input.organizationSlug && input.projectId),
    queryFn: async () => {
      try {
        const response = await dictionaryClient.projectDictionaries({
          param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
        });
        return (response.dictionaries ?? []) as AttachedSpellcheckDictionary[];
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(spellcheckDictionaryContextMessages.loadFailed),
          ),
          { cause: error },
        );
      }
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

      try {
        await dictionaryClient.addWord({
          param: { organizationSlug: input.organizationSlug, dictionaryId: defaultDictionary.id },
          json: { locale: trimmedLocale, word },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(spellcheckDictionaryContextMessages.addFailed),
          ),
          { cause: error },
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
        goSvcErrorMessage(error, intl.formatMessage(spellcheckDictionaryContextMessages.addFailed)),
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
      canAddWords: Boolean(input.canWriteDictionaries && defaultDictionary),
      addWord,
      isAdding: addMutation.isPending,
    }),
    [
      addMutation.isPending,
      addWord,
      defaultDictionary,
      input.canWriteDictionaries,
      resolvedQuery.data?.words,
    ],
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
