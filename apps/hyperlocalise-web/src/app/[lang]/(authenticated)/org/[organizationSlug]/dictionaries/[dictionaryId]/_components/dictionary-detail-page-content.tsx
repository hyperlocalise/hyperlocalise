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
import { useMemo, useRef } from "react";
import {
  ArrowLeftIcon,
  DownloadSimpleIcon,
  PlusIcon,
  TextTIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { normalizeSpellcheckWord } from "@/lib/spellcheck-dictionary/normalize-word";
import { createDictionaryClient } from "@/lib/spellcheck-dictionary/client";

import { ProjectChips } from "../../../_components/project-chips";
import type { ApiDictionary } from "../../_components/dictionary-list";
import {
  DictionariesPageStoreProvider,
  useDictionariesPageStore,
} from "../../store/dictionaries-store-context";
import { dictionaryDetailMessages } from "./dictionary-detail-page-content.messages";

const DICTIONARY_WORDS_PAGE_SIZE = 200;

type DictionaryWord = {
  id: string;
  locale: string;
  word: string;
  createdAt: string;
};

type DictionaryProject = {
  projectId: string;
  projectName: string;
  priority: number;
};

type ProjectOption = {
  id: string;
  name: string;
};

export function DictionaryDetailPageContent({
  organizationSlug,
  dictionaryId,
  canWriteDictionaries,
}: {
  organizationSlug: string;
  dictionaryId: string;
  canWriteDictionaries: boolean;
}) {
  return (
    <DictionariesPageStoreProvider organizationSlug={organizationSlug}>
      <DictionaryDetailPageView
        dictionaryId={dictionaryId}
        canWriteDictionaries={canWriteDictionaries}
      />
    </DictionariesPageStoreProvider>
  );
}

const DictionaryDetailPageView = observer(function DictionaryDetailPageView({
  dictionaryId,
  canWriteDictionaries,
}: {
  dictionaryId: string;
  canWriteDictionaries: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const dictionaryClient = useMemo(() => createDictionaryClient(goSvcClient), [goSvcClient]);
  const store = useDictionariesPageStore();
  const organizationSlug = store.organizationSlug;
  const locale = store.detailLocale;
  const word = store.detailWord;
  const importInputRef = useRef<HTMLInputElement>(null);
  const dictionariesHref = `/org/${organizationSlug}/dictionaries`;

  const dictionaryQuery = useQuery({
    queryKey: ["spellcheck-dictionary", organizationSlug, dictionaryId],
    queryFn: async () => {
      try {
        const response = await dictionaryClient.get({
          param: { organizationSlug, dictionaryId },
        });
        return response.dictionary as ApiDictionary;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.loadFailed)),
          { cause: error },
        );
      }
    },
  });

  const wordsQuery = useInfiniteQuery({
    queryKey: ["dictionary-words", organizationSlug, dictionaryId, locale],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      try {
        const response = await dictionaryClient.words({
          param: { organizationSlug, dictionaryId },
          query: {
            locale,
            limit: String(DICTIONARY_WORDS_PAGE_SIZE),
            offset: String(pageParam),
          },
        });
        return {
          words: (response.words ?? []) as DictionaryWord[],
          total: Number(response.total ?? 0),
          offset: pageParam,
        };
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.loadFailed)),
          { cause: error },
        );
      }
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.words.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
  });
  const dictionaryWords = useMemo(
    () => wordsQuery.data?.pages.flatMap((page) => page.words) ?? [],
    [wordsQuery.data?.pages],
  );
  const totalWords = wordsQuery.data?.pages[0]?.total ?? 0;

  const projectsQuery = useQuery({
    queryKey: ["dictionary-projects", organizationSlug, dictionaryId],
    queryFn: async () => {
      try {
        const response = await dictionaryClient.projects({
          param: { organizationSlug, dictionaryId },
        });
        return (response.projects ?? []) as DictionaryProject[];
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.loadFailed)),
          { cause: error },
        );
      }
    },
  });

  const availableProjectsQuery = useQuery({
    queryKey: ["dictionary-available-projects", organizationSlug],
    enabled: canWriteDictionaries,
    queryFn: async () => {
      try {
        const body = await goSvcClient.project.list(organizationSlug);
        return (body.projects ?? []) as ProjectOption[];
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.loadFailed)),
          { cause: error },
        );
      }
    },
  });

  const attachedIds = useMemo(
    () => new Set((projectsQuery.data ?? []).map((project) => project.projectId)),
    [projectsQuery.data],
  );
  const availableProjects = (availableProjectsQuery.data ?? []).filter(
    (project) => !attachedIds.has(project.id),
  );

  const invalidateDictionary = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["spellcheck-dictionary", organizationSlug, dictionaryId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["dictionary-words", organizationSlug, dictionaryId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["dictionary-projects", organizationSlug, dictionaryId],
      }),
      queryClient.invalidateQueries({ queryKey: ["spellcheck-dictionaries", organizationSlug] }),
    ]);
  };

  const addWord = useMutation({
    mutationFn: async () => {
      const parsed = normalizeSpellcheckWord(word);
      if (!parsed) {
        throw new Error(intl.formatMessage(dictionaryDetailMessages.wordRequired));
      }
      try {
        await dictionaryClient.addWord({
          param: { organizationSlug, dictionaryId },
          json: { locale: locale.trim(), word: parsed.word },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.addFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: async () => {
      store.clearDetailWord();
      await invalidateDictionary();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(dictionaryDetailMessages.addFailed),
      );
    },
  });

  const deleteWord = useMutation({
    mutationFn: async (wordId: string) => {
      try {
        await dictionaryClient.removeWord({
          param: { organizationSlug, dictionaryId, wordId },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.addFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: invalidateDictionary,
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(dictionaryDetailMessages.addFailed),
      );
    },
  });

  const importWords = useMutation({
    mutationFn: async (content: string) => {
      try {
        await dictionaryClient.importWords({
          param: { organizationSlug, dictionaryId },
          json: { locale: locale.trim(), content },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.importFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: invalidateDictionary,
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(dictionaryDetailMessages.importFailed),
      );
    },
  });

  const attachProject = useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await dictionaryClient.attachProject({
          param: { organizationSlug, dictionaryId },
          json: { projectId },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.attachFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: invalidateDictionary,
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(dictionaryDetailMessages.attachFailed),
      );
    },
  });

  const detachProject = useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await dictionaryClient.detachProject({
          param: { organizationSlug, dictionaryId, projectId },
        });
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.attachFailed)),
          { cause: error },
        );
      }
    },
    onSuccess: invalidateDictionary,
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(dictionaryDetailMessages.attachFailed),
      );
    },
  });

  async function exportWords() {
    try {
      const response = await dictionaryClient.exportWords({
        param: { organizationSlug, dictionaryId },
        query: { locale: locale.trim() },
      });
      const body = await response.blob.text();
      const blob = new Blob([body], { type: response.contentType ?? "text/plain;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${locale.trim() || "dictionary"}.txt`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast.error(
        goSvcErrorMessage(error, intl.formatMessage(dictionaryDetailMessages.exportFailed)),
      );
    }
  }

  const dictionary = dictionaryQuery.data;
  const localeLabel = locale.trim() || "—";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <Button
            nativeButton={false}
            render={<OrgNavLink href={dictionariesHref} />}
            variant="ghost"
            size="sm"
            className="-ms-2 text-muted-foreground"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            <FormattedMessage {...dictionaryDetailMessages.backToDictionaries} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TextTIcon className="size-5 text-muted-foreground" />
          {dictionary ? (
            <Badge variant="outline">
              {intl.formatMessage(dictionaryDetailMessages.wordCount, {
                count: dictionary.wordCount,
              })}
            </Badge>
          ) : null}
        </div>
        {dictionary ? (
          <TypographyH1 className="text-3xl md:text-4xl" weight="bold">
            {dictionary.name}
          </TypographyH1>
        ) : dictionaryQuery.isLoading ? (
          <Skeleton className="h-10 w-64" />
        ) : null}
        {dictionaryQuery.isError ? (
          <TypographyP className="text-destructive" size="small">
            {dictionaryQuery.error instanceof Error
              ? dictionaryQuery.error.message
              : intl.formatMessage(dictionaryDetailMessages.loadFailed)}
          </TypographyP>
        ) : null}
        <TypographyP className="max-w-3xl leading-6" size="small" tone="subtle">
          {dictionary?.description ||
            intl.formatMessage(dictionaryDetailMessages.descriptionFallback)}
        </TypographyP>
        <ProjectChips
          projects={(projectsQuery.data ?? []).map((project) => ({
            id: project.projectId,
            name: project.projectName,
          }))}
          assignable={availableProjects.map((project) => ({ id: project.id, name: project.name }))}
          loaded={projectsQuery.isSuccess}
          canManage={canWriteDictionaries}
          assigning={attachProject.isPending}
          removing={detachProject.isPending}
          onAssign={(projectId) => attachProject.mutate(projectId)}
          onRemove={(projectId) => detachProject.mutate(projectId)}
          labels={{
            usedIn: intl.formatMessage(dictionaryDetailMessages.usedInLabel),
            empty: intl.formatMessage(dictionaryDetailMessages.emptyProjects),
            assign: intl.formatMessage(dictionaryDetailMessages.assignProject),
            noAssignable: intl.formatMessage(dictionaryDetailMessages.noAssignableProjects),
            remove: (name) => intl.formatMessage(dictionaryDetailMessages.removeProject, { name }),
          }}
        />
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <TypographyP size="small" weight="medium" tone="content">
              <FormattedMessage {...dictionaryDetailMessages.wordsTitle} />
            </TypographyP>
            {wordsQuery.isSuccess ? (
              <TypographyP size="xsmall" tone="subtle">
                {intl.formatMessage(dictionaryDetailMessages.localeWordCount, {
                  count: totalWords,
                  locale: localeLabel,
                })}
              </TypographyP>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {canWriteDictionaries ? (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    void file.text().then((content) => importWords.mutate(content));
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={importWords.isPending}
                  onClick={() => importInputRef.current?.click()}
                >
                  {importWords.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UploadSimpleIcon data-icon="inline-start" />
                  )}
                  <FormattedMessage {...dictionaryDetailMessages.importWords} />
                </Button>
              </>
            ) : null}
            <Button type="button" variant="outline" onClick={() => void exportWords()}>
              <DownloadSimpleIcon data-icon="inline-start" />
              <FormattedMessage {...dictionaryDetailMessages.exportWords} />
            </Button>
          </div>
        </div>

        {canWriteDictionaries ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addWord.mutate();
            }}
          >
            <Input
              aria-label={intl.formatMessage(dictionaryDetailMessages.localeLabel)}
              value={locale}
              onChange={(event) => store.setDetailLocale(event.target.value)}
              placeholder={intl.formatMessage(dictionaryDetailMessages.localePlaceholder)}
              className="w-28 font-mono text-xs"
            />
            <Input
              aria-label={intl.formatMessage(dictionaryDetailMessages.wordLabel)}
              value={word}
              onChange={(event) => store.setDetailWord(event.target.value)}
              placeholder={intl.formatMessage(dictionaryDetailMessages.wordPlaceholder)}
              className="min-w-48 flex-1 sm:max-w-sm"
            />
            <Button type="submit" disabled={addWord.isPending || !word.trim()}>
              <PlusIcon data-icon="inline-start" />
              <FormattedMessage {...dictionaryDetailMessages.addWord} />
            </Button>
          </form>
        ) : (
          <Input
            aria-label={intl.formatMessage(dictionaryDetailMessages.localeLabel)}
            value={locale}
            onChange={(event) => store.setDetailLocale(event.target.value)}
            placeholder={intl.formatMessage(dictionaryDetailMessages.localePlaceholder)}
            className="w-28 font-mono text-xs"
          />
        )}

        {dictionaryWords.length === 0 && wordsQuery.isSuccess ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <TypographyP size="small" tone="subtle">
              {intl.formatMessage(dictionaryDetailMessages.emptyWords, { locale: localeLabel })}
            </TypographyP>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {dictionaryWords.map((entry) => (
              <li
                key={entry.id}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted/30 ps-2.5 pe-1 text-sm text-foreground"
              >
                <span className="max-w-64 truncate">{entry.word}</span>
                {canWriteDictionaries ? (
                  <button
                    type="button"
                    aria-label={intl.formatMessage(dictionaryDetailMessages.deleteWord, {
                      word: entry.word,
                    })}
                    disabled={deleteWord.isPending}
                    onClick={() => deleteWord.mutate(entry.id)}
                    className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <XIcon className="size-3" weight="bold" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {wordsQuery.hasNextPage ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={wordsQuery.isFetchingNextPage}
              onClick={() => void wordsQuery.fetchNextPage()}
            >
              <FormattedMessage {...dictionaryDetailMessages.loadMore} />
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
});
