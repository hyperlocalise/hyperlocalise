"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import type {
  ProjectFileContent,
  ProjectSourceStringEntry,
  ProjectSourceStringsPreview,
} from "@/api/routes/project/project.schema";
import { ProjectFileStringContextDialog } from "./project-file-string-context-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { parseSourceStringsFromFileContent } from "@/lib/projects/project-file-source-strings";
import { cn } from "@/lib/primitives/cn";

type GitHubRepositoryOption = {
  fullName: string;
  enabled: boolean;
};

function useEnabledGitHubRepositories(organizationSlug: string) {
  return useQuery({
    queryKey: ["github-installation-repositories", organizationSlug, "enabled-only"],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$get({
        param: { organizationSlug },
        query: {},
      });

      if (!response.ok) {
        throw new Error("Failed to load GitHub repositories");
      }

      const body = (await response.json()) as { repositories: GitHubRepositoryOption[] };
      return body.repositories.filter((repository) => repository.enabled);
    },
  });
}

export function ProjectFileSourceStringsPreview({
  organizationSlug,
  projectId,
  sourcePath,
  content,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  content: ProjectFileContent | null | undefined;
}) {
  const sourceStrings = useMemo(() => parseSourceStringsFromFileContent(content), [content]);

  const repositoriesQuery = useEnabledGitHubRepositories(organizationSlug);
  const enabledRepositories = repositoriesQuery.data ?? [];

  const [repositoryFullName, setRepositoryFullName] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeEntry, setActiveEntry] = useState<ProjectSourceStringEntry | null>(null);
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const lookupMutation = useMutation({
    mutationFn: async (entry: ProjectSourceStringEntry) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files[
        "string-context"
      ].$post({
        param: { organizationSlug, projectId },
        json: {
          repositoryFullName,
          sourcePath,
          key: entry.key,
          text: entry.text,
          context: entry.context,
        },
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Failed to look up repository context"));
      }

      const body = (await response.json()) as { stringContext: { summary: string } };
      return body.stringContext.summary;
    },
    onMutate: (entry) => {
      setActiveEntry(entry);
      setContextSummary(null);
      setContextError(null);
      setDialogOpen(true);
    },
    onSuccess: (summary) => {
      setContextSummary(summary);
    },
    onError: (error) => {
      setContextError(
        error instanceof Error ? error.message : "Failed to look up repository context.",
      );
    },
  });

  if (!sourceStrings || sourceStrings.entries.length === 0) {
    return null;
  }

  return (
    <>
      <SourceStringsTable
        preview={sourceStrings}
        repositoryFullName={repositoryFullName}
        repositories={enabledRepositories}
        repositoriesLoading={repositoriesQuery.isLoading}
        onRepositoryChange={setRepositoryFullName}
        onFindInRepo={(entry) => {
          if (!repositoryFullName) {
            return;
          }
          lookupMutation.mutate(entry);
        }}
        findInRepoPending={lookupMutation.isPending}
      />

      <ProjectFileStringContextDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={activeEntry}
        repositoryFullName={repositoryFullName || null}
        isLoading={lookupMutation.isPending}
        summary={contextSummary}
        errorMessage={contextError}
      />
    </>
  );
}

function SourceStringsTable({
  preview,
  repositoryFullName,
  repositories,
  repositoriesLoading,
  onRepositoryChange,
  onFindInRepo,
  findInRepoPending,
}: {
  preview: ProjectSourceStringsPreview;
  repositoryFullName: string;
  repositories: GitHubRepositoryOption[];
  repositoriesLoading: boolean;
  onRepositoryChange: (fullName: string) => void;
  onFindInRepo: (entry: ProjectSourceStringEntry) => void;
  findInRepoPending: boolean;
}) {
  const repoReady = Boolean(repositoryFullName);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <TypographyP className="text-xs text-foreground/52">
          {preview.entries.length} string{preview.entries.length === 1 ? "" : "s"}
          {preview.truncated ? " (preview truncated)" : ""}
        </TypographyP>
        <div className="flex w-full flex-col gap-1.5 sm:max-w-xs">
          <TypographyP className="text-[10px] font-medium tracking-wide text-foreground/42 uppercase">
            Repository for context lookup
          </TypographyP>
          {repositoriesLoading ? (
            <div className="flex h-9 items-center gap-2 px-1">
              <Spinner className="size-4" />
              <TypographyP className="text-xs text-foreground/42">Loading repos…</TypographyP>
            </div>
          ) : repositories.length === 0 ? (
            <TypographyP className="text-xs text-foreground/42">
              Enable a repository under Integrations → GitHub to search for context.
            </TypographyP>
          ) : (
            <Select
              value={repositoryFullName}
              onValueChange={(value) => onRepositoryChange(value ?? "")}
            >
              <SelectTrigger className="h-9 w-full font-mono text-xs">
                <SelectValue placeholder="Select repository" />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((repository) => (
                  <SelectItem key={repository.fullName} value={repository.fullName}>
                    {repository.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {preview.note ? (
        <TypographyP className="text-xs text-foreground/42">{preview.note}</TypographyP>
      ) : null}

      <div className="overflow-hidden rounded-md border border-foreground/8 bg-background">
        <div className="max-h-[min(24rem,50vh)] overflow-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-foreground/8 bg-background/95 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 font-medium text-foreground/52">Key</th>
                <th className="px-3 py-2 font-medium text-foreground/52">Text</th>
                <th className="px-3 py-2 font-medium text-foreground/52">Context</th>
                <th className="w-28 px-3 py-2 font-medium text-foreground/52" />
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/8">
              {preview.entries.map((entry) => (
                <tr key={entry.id ?? entry.key} className="align-top">
                  <td className="px-3 py-2 font-mono text-foreground/82">{entry.key}</td>
                  <td className="max-w-[14rem] px-3 py-2 whitespace-pre-wrap text-foreground/78">
                    {entry.text}
                  </td>
                  <td className="max-w-[12rem] px-3 py-2 whitespace-pre-wrap text-foreground/52">
                    {entry.context?.trim() ? entry.context : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      disabled={!repoReady || findInRepoPending}
                      onClick={() => onFindInRepo(entry)}
                    >
                      Find in repo
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!repoReady && repositories.length > 0 ? (
        <TypographyP className={cn("text-xs text-foreground/42")}>
          Select a repository, then use Find in repo on a string to run the same repository agent as
          Slack.
        </TypographyP>
      ) : null}
    </div>
  );
}
