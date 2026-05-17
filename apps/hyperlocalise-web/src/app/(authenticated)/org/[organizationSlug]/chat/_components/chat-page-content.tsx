"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Add01Icon,
  AiImageIcon,
  AiWebBrowsingIcon,
  ArrowDown01Icon,
  BubbleChatTranslateIcon,
  Cancel01Icon,
  SentIcon,
  CheckmarkCircle02Icon,
  FileAttachmentIcon,
  FolderLibraryIcon,
  MailReceive01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

const suggestedRequests = [
  {
    icon: BubbleChatTranslateIcon,
    text: "Translate these release notes into ja-JP and vi-VN using the selected project's tone and glossary.",
  },
  {
    icon: FileAttachmentIcon,
    text: "Translate the attached resource file while preserving keys, placeholders, and file structure.",
  },
  {
    icon: CheckmarkCircle02Icon,
    text: "Review these strings for tone, terminology, placeholders, and length risks before release.",
  },
  {
    icon: MailReceive01Icon,
    text: "Suggest glossary updates from this copy, including product terms and forbidden translations.",
  },
] as const;

const attachOptions = [
  {
    icon: FileAttachmentIcon,
    label: "Add source files",
  },
  {
    icon: AiImageIcon,
    label: "Create Image",
  },
  {
    icon: AiWebBrowsingIcon,
    label: "Research",
  },
] as const;

const translationSourceFileAccept = [
  ".json",
  ".jsonc",
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

type ApiProject = {
  id: string;
  name: string;
};

export function ChatPageContent({ organizationSlug }: { organizationSlug: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }

      const body = (await response.json()) as { projects: ApiProject[] };
      return body.projects;
    },
  });
  const projects = projectsQuery.data ?? [];
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const projectTriggerLabel = selectedProject?.name ?? "Project";

  const chatRequestMutation = useMutation({
    mutationFn: async () => {
      if (files.length > 0) {
        const formData = new FormData();
        formData.set("text", text.trim() || "Please translate the attached source file.");
        if (selectedProject?.id) {
          formData.set("projectId", selectedProject.id);
        }
        for (const file of files) {
          formData.append("files", file);
        }

        const response = await fetch(`/api/orgs/${organizationSlug}/chat-requests/upload`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error(`Failed to send request (${response.status})`);
        }
        return response.json() as Promise<{ conversation: { id: string } }>;
      }

      const response = await apiClient.api.orgs[":organizationSlug"]["chat-requests"].$post({
        param: { organizationSlug },
        json: {
          text,
          projectId: selectedProject?.id,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to send request (${response.status})`);
      }
      return response.json() as Promise<{ conversation: { id: string } }>;
    },
    onSuccess: (data) => {
      router.push(`/org/${organizationSlug}/inbox/${data.conversation.id}`);
    },
  });
  const canSubmit = Boolean(text.trim() || files.length > 0) && !chatRequestMutation.isPending;

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
              chatRequestMutation.mutate();
            }
          }}
          className="overflow-hidden rounded-[1.35rem] bg-muted text-foreground shadow-2xl shadow-black/10 transition-all focus-within:ring-[3px] focus-within:ring-ring/50"
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
                  chatRequestMutation.mutate();
                }
              }
            }}
            className="min-h-36 w-full resize-none bg-transparent px-4 py-4 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:px-6 sm:py-5"
            placeholder="Paste source text or ask Hyperlocalise to translate a file, string, or inbox request..."
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
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-full text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                            aria-label="Add translation context"
                          />
                        }
                      />
                    }
                  >
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>Add translation context</TooltipContent>
                </Tooltip>
                <DropdownMenuContent className="min-w-52" align="start">
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      closeOnClick={false}
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                    >
                      <HugeiconsIcon
                        icon={attachOptions[0].icon}
                        strokeWidth={1.8}
                        className="size-4"
                      />
                      {attachOptions[0].label}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {attachOptions.slice(1).map((option) => (
                      <DropdownMenuItem key={option.label} disabled>
                        <HugeiconsIcon icon={option.icon} strokeWidth={1.8} className="size-4" />
                        {option.label} (soon)
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full px-2.5 text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                    />
                  }
                >
                  <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
                  {projectsQuery.isLoading ? (
                    <Skeleton className="h-3.5 w-24 rounded-full bg-muted-foreground/20" />
                  ) : (
                    projectTriggerLabel
                  )}
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-56" align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Projects</DropdownMenuLabel>
                    {projectsQuery.isLoading ? (
                      <>
                        <DropdownMenuItem disabled>
                          <Skeleton className="size-4 rounded-md bg-muted-foreground/20" />
                          <Skeleton className="h-3.5 w-28 rounded-full bg-muted-foreground/20" />
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          <Skeleton className="size-4 rounded-md bg-muted-foreground/20" />
                          <Skeleton className="h-3.5 w-24 rounded-full bg-muted-foreground/20" />
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                          <Skeleton className="size-4 rounded-md bg-muted-foreground/20" />
                          <Skeleton className="h-3.5 w-32 rounded-full bg-muted-foreground/20" />
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {projectsQuery.isError ? (
                      <DropdownMenuItem disabled>Unable to load projects</DropdownMenuItem>
                    ) : null}
                    {projectsQuery.isSuccess && projects.length === 0 ? (
                      <DropdownMenuItem disabled>No projects found</DropdownMenuItem>
                    ) : null}
                    {projects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <HugeiconsIcon
                          icon={FolderLibraryIcon}
                          strokeWidth={1.8}
                          className="size-4"
                        />
                        {project.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="submit"
                      disabled={!canSubmit}
                      className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      aria-label="Send translation request"
                    />
                  }
                >
                  {chatRequestMutation.isPending ? (
                    <Spinner className="text-primary-foreground" />
                  ) : (
                    <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
                  )}
                  Send
                </TooltipTrigger>
                <TooltipContent side="top" align="end">
                  Send request
                  <Kbd className="ms-2 bg-background/20 text-background">Enter</Kbd>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </form>

        <TypographyMuted className="mt-5 flex items-center justify-center gap-2 text-xs">
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={1.7} className="size-3.5" />
          Agent can turn inbox requests into translation jobs, glossary updates, or reviewer tasks.
        </TypographyMuted>

        <div className="mt-10 bg-muted/5">
          {suggestedRequests.map((request, index) => (
            <div key={request.text}>
              <button
                type="button"
                onClick={() => setText(request.text)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:bg-muted/80 focus-visible:outline-none"
              >
                <HugeiconsIcon
                  icon={request.icon}
                  strokeWidth={1.7}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 text-sm leading-5">{request.text}</span>
              </button>
              {index < suggestedRequests.length - 1 ? <Separator className="bg-border/20" /> : null}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
