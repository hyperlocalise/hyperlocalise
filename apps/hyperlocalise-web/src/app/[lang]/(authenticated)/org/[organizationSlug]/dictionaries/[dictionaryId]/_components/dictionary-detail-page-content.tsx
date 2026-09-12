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
import { useMemo, useRef, useState } from "react";
import { TextFontIcon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { readApiError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { normalizeSpellcheckWord } from "@/lib/spellcheck-dictionary/normalize-word";

import { PageHeader, WorkspacePageShell } from "../../../_components/workspace-resource-shared";
import type { ApiDictionary } from "../../_components/dictionary-list";
import { dictionaryDetailMessages } from "./dictionary-detail-page-content.messages";

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
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState("en-US");
  const [word, setWord] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const dictionaryQuery = useQuery({
    queryKey: ["spellcheck-dictionary", organizationSlug, dictionaryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].$get({
        param: { organizationSlug, dictionaryId },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(dictionaryDetailMessages.loadFailed),
        );
      }
      const body = await response.json();
      return body.dictionary as ApiDictionary;
    },
  });

  const wordsQuery = useQuery({
    queryKey: ["dictionary-words", organizationSlug, dictionaryId, locale],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].words.$get({
        param: { organizationSlug, dictionaryId },
        query: { locale, limit: "200", offset: "0" },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(dictionaryDetailMessages.loadFailed),
        );
      }
      const body = await response.json();
      return (body.words ?? []) as DictionaryWord[];
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["dictionary-projects", organizationSlug, dictionaryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].projects.$get({
        param: { organizationSlug, dictionaryId },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(dictionaryDetailMessages.loadFailed),
        );
      }
      const body = await response.json();
      return (body.projects ?? []) as DictionaryProject[];
    },
  });

  const availableProjectsQuery = useQuery({
    queryKey: ["dictionary-available-projects", organizationSlug],
    enabled: canWriteDictionaries,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw await readApiResponseError(
          response,
          intl.formatMessage(dictionaryDetailMessages.loadFailed),
        );
      }
      const body = await response.json();
      return (body.projects ?? []) as ProjectOption[];
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
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].words.$post({
        param: { organizationSlug, dictionaryId },
        json: { locale: locale.trim(), word: parsed.word },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(dictionaryDetailMessages.addFailed)),
        );
      }
    },
    onSuccess: async () => {
      setWord("");
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
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].words[":wordId"].$delete({
        param: { organizationSlug, dictionaryId, wordId },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(dictionaryDetailMessages.addFailed)),
        );
      }
    },
    onSuccess: invalidateDictionary,
  });

  const importWords = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].words["import"].$post({
        param: { organizationSlug, dictionaryId },
        json: { locale: locale.trim(), content },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(dictionaryDetailMessages.importFailed)),
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
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].projects.$post({
        param: { organizationSlug, dictionaryId },
        json: { projectId, priority: 0 },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(dictionaryDetailMessages.attachFailed)),
        );
      }
    },
    onSuccess: async () => {
      setSelectedProjectId("");
      await invalidateDictionary();
    },
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
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].projects[":projectId"].$delete({
        param: { organizationSlug, dictionaryId, projectId },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(dictionaryDetailMessages.attachFailed)),
        );
      }
    },
    onSuccess: invalidateDictionary,
  });

  async function exportWords() {
    try {
      const response = await apiClient.api.orgs[":organizationSlug"].dictionaries[
        ":dictionaryId"
      ].words["export"].$get({
        param: { organizationSlug, dictionaryId },
        query: { locale: locale.trim() },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, intl.formatMessage(dictionaryDetailMessages.exportFailed)),
        );
      }
      const body = await response.text();
      const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${locale.trim() || "dictionary"}.txt`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(dictionaryDetailMessages.exportFailed),
      );
    }
  }

  const dictionary = dictionaryQuery.data;

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={TextFontIcon}
        title={dictionary?.name ?? dictionaryId}
        description={
          dictionary?.description || intl.formatMessage(dictionaryDetailMessages.wordsTitle)
        }
      />

      {dictionaryQuery.isError ? (
        <TypographyP className="text-flame-100" size="small">
          {dictionaryQuery.error instanceof Error
            ? dictionaryQuery.error.message
            : intl.formatMessage(dictionaryDetailMessages.loadFailed)}
        </TypographyP>
      ) : null}

      <section className="grid gap-3">
        <TypographyP size="small" weight="medium">
          <FormattedMessage {...dictionaryDetailMessages.wordsTitle} />
        </TypographyP>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="grid min-w-0 gap-1.5 sm:w-36">
            <span className="text-xs font-medium text-muted-foreground">
              <FormattedMessage {...dictionaryDetailMessages.localeLabel} />
            </span>
            <Input
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              placeholder={intl.formatMessage(dictionaryDetailMessages.localePlaceholder)}
            />
          </label>
          {canWriteDictionaries ? (
            <>
              <label className="grid min-w-0 flex-1 gap-1.5 sm:max-w-xs">
                <span className="text-xs font-medium text-muted-foreground">
                  <FormattedMessage {...dictionaryDetailMessages.wordLabel} />
                </span>
                <Input
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addWord.mutate();
                    }
                  }}
                />
              </label>
              <Button size="sm" onClick={() => addWord.mutate()} disabled={addWord.isPending}>
                <FormattedMessage {...dictionaryDetailMessages.addWord} />
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".txt,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  void file.text().then((content) => importWords.mutate(content));
                  event.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => importInputRef.current?.click()}
              >
                <FormattedMessage {...dictionaryDetailMessages.importWords} />
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void exportWords()}>
            <FormattedMessage {...dictionaryDetailMessages.exportWords} />
          </Button>
        </div>

        {wordsQuery.isSuccess && (wordsQuery.data?.length ?? 0) === 0 ? (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...dictionaryDetailMessages.emptyWords} />
          </TypographyP>
        ) : null}

        {(wordsQuery.data ?? []).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-2"
          >
            <span className="text-sm text-foreground">{entry.word}</span>
            {canWriteDictionaries ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteWord.mutate(entry.id)}
                disabled={deleteWord.isPending}
              >
                <FormattedMessage {...dictionaryDetailMessages.deleteWord} />
              </Button>
            ) : null}
          </div>
        ))}
      </section>

      <section className="grid gap-3">
        <TypographyP size="small" weight="medium">
          <FormattedMessage {...dictionaryDetailMessages.projectsTitle} />
        </TypographyP>
        {canWriteDictionaries ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Select
              value={selectedProjectId}
              onValueChange={(value) => setSelectedProjectId(value ?? "")}
            >
              <SelectTrigger className="sm:w-72">
                <SelectValue
                  placeholder={intl.formatMessage(dictionaryDetailMessages.selectProject)}
                />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id} label={project.name}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!selectedProjectId || attachProject.isPending}
              onClick={() => attachProject.mutate(selectedProjectId)}
            >
              <FormattedMessage {...dictionaryDetailMessages.attachProject} />
            </Button>
          </div>
        ) : null}

        {(projectsQuery.data?.length ?? 0) === 0 ? (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...dictionaryDetailMessages.noProjects} />
          </TypographyP>
        ) : (
          (projectsQuery.data ?? []).map((project) => (
            <div
              key={project.projectId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-2"
            >
              <span className="text-sm text-foreground">{project.projectName}</span>
              {canWriteDictionaries ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => detachProject.mutate(project.projectId)}
                  disabled={detachProject.isPending}
                >
                  <FormattedMessage {...dictionaryDetailMessages.detachProject} />
                </Button>
              ) : null}
            </div>
          ))
        )}
      </section>
    </WorkspacePageShell>
  );
}
