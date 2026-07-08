"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Cancel01Icon, FileAttachmentIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH2 } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import type { GithubRepository } from "../../_components/github-repository";
import { RepositorySelector } from "../../_components/repository-selector";

const translationSourceFileAccept = [
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".arb",
  ".xlf",
  ".xlif",
  ".xliff",
  ".po",
  ".html",
  ".md",
  ".mdx",
  ".strings",
  ".stringsdict",
  ".csv",
].join(",");
const maxTranslationSourceFiles = 5;

export function ChatPageContent({ organizationSlug }: { organizationSlug: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedRepositoryFullName, setSelectedRepositoryFullName] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const repositoriesQuery = useQuery({
    queryKey: ["github-repositories", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["github-installation"][
        "repositories"
      ].$get({ param: { organizationSlug }, query: {} });

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load GitHub repositories");
      }

      const body = (await response.json()) as { repositories: GithubRepository[] };
      return body.repositories.filter((repository) => repository.enabled && !repository.archived);
    },
  });
  const repositories = repositoriesQuery.data ?? [];
  const resolvedRepositoryFullName =
    selectedRepositoryFullName || (repositories.length === 1 ? repositories[0]?.fullName : "");

  useEffect(() => {
    if (
      selectedRepositoryFullName &&
      !repositories.some((repository) => repository.fullName === selectedRepositoryFullName)
    ) {
      setSelectedRepositoryFullName("");
    }
  }, [repositories, selectedRepositoryFullName]);

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.set("text", text.trim() || "Please translate the attached source file.");
      if (resolvedRepositoryFullName) {
        formData.set("repositoryFullName", resolvedRepositoryFullName);
      }
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/conversations`,
        {
          method: "POST",
          body: formData,
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to send request (${response.status})`);
      }
      return response.json() as Promise<{ conversation: { id: string } }>;
    },
    onSuccess: (data) => {
      router.push(`/org/${organizationSlug}/inbox/${data.conversation.id}`);
    },
  });
  const canSubmit =
    Boolean(text.trim() || files.length > 0) && !createConversationMutation.isPending;

  return (
    <main className="mx-auto flex min-h-[calc(100svh-7rem)] w-full max-w-6xl flex-col items-center justify-center px-4 py-8 sm:px-6">
      <section className="w-full max-w-5xl">
        <div className="mb-7 text-center">
          <TypographyH2 className="text-balance text-foreground">
            What should we localise?
          </TypographyH2>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) {
              createConversationMutation.mutate();
            }
          }}
          className="overflow-hidden rounded-[1.35rem] bg-muted text-foreground shadow-2xl shadow-black/10 transition-all focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
        >
          <label htmlFor="inbox-request" className="sr-only">
            Translation request
          </label>
          <textarea
            id="inbox-request"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSubmit) {
                  createConversationMutation.mutate();
                }
              }
            }}
            className="min-h-36 w-full resize-none bg-transparent px-4 py-4 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:px-6 sm:py-5"
            placeholder="Paste text or describe what to translate..."
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={translationSourceFileAccept}
            className="sr-only"
            onChange={(e) => {
              const nextFiles = Array.from(e.target.files ?? []);
              setFiles((currentFiles) => {
                const existing = new Set(
                  currentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
                );
                return [
                  ...currentFiles,
                  ...nextFiles.filter(
                    (file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`),
                  ),
                ].slice(0, maxTranslationSourceFiles);
              });
              e.target.value = "";
            }}
          />
          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-border px-4 pb-4 sm:px-6">
              {files.map((file) => (
                <span
                  key={`${file.name}:${file.size}:${file.lastModified}`}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
                >
                  <HugeiconsIcon
                    icon={FileAttachmentIcon}
                    strokeWidth={1.8}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setFiles((currentFiles) => currentFiles.filter((item) => item !== file))
                    }
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-background/70 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                      aria-label="Add source files"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <HugeiconsIcon
                        icon={FileAttachmentIcon}
                        strokeWidth={1.8}
                        className="size-4"
                      />
                    </Button>
                  }
                />
                <TooltipContent>Add source files</TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RepositorySelector
                repositories={repositories}
                repositoriesIsError={repositoriesQuery.isError}
                repositoriesIsLoading={repositoriesQuery.isLoading}
                selectedRepositoryFullName={resolvedRepositoryFullName}
                onSelectRepository={setSelectedRepositoryFullName}
                triggerStyle="button"
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="submit"
                      disabled={!canSubmit}
                      className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      aria-label="Send translation request"
                    >
                      {createConversationMutation.isPending ? (
                        <Spinner className="text-primary-foreground" />
                      ) : (
                        <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
                      )}
                      Send
                    </Button>
                  }
                />
                <TooltipContent side="top" align="end">
                  Send request
                  <Kbd className="ms-2 bg-background/15 text-background">Enter</Kbd>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
