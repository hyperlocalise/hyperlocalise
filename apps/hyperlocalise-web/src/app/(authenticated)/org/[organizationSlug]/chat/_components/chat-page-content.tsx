"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Add01Icon,
  AiImageIcon,
  AiWebBrowsingIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  BubbleChatTranslateIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TypographyH1,
  TypographyH4,
  TypographyMuted,
  TypographySmall,
} from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

const suggestedRequests = [
  {
    icon: MailReceive01Icon,
    title: "Translate the latest launch copy",
    detail: "Use Product Web and prepare fr-FR, de-DE, and ja-JP drafts",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "Review blocked locale approvals",
    detail: "Summarize unresolved comments before the release window",
  },
  {
    icon: BubbleChatTranslateIcon,
    title: "Adapt support macros for APAC",
    detail: "Keep placeholders and legal disclaimers unchanged",
  },
  {
    icon: Clock01Icon,
    title: "Show translation work due today",
    detail: "Prioritize inbox requests that affect the next release",
  },
] as const;

const attachOptions = [
  {
    icon: FileAttachmentIcon,
    label: "Add photos & files",
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

type ApiProject = {
  id: string;
  name: string;
};

export function ChatPageContent({ organizationSlug }: { organizationSlug: string }) {
  const router = useRouter();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [text, setText] = useState("");
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

  return (
    <main className="mx-auto flex min-h-[calc(100svh-7rem)] w-full max-w-6xl flex-col items-center justify-center px-4 py-8 sm:px-6">
      <section className="w-full max-w-5xl">
        <div className="mb-7 text-center">
          <TypographyH1 className="text-balance text-foreground">
            What do you want to translate?
          </TypographyH1>
        </div>

        <div className="overflow-hidden rounded-[1.35rem] border border-border bg-app-shell-background text-foreground shadow-2xl shadow-black/10">
          <label htmlFor="inbox-request" className="sr-only">
            Translation request
          </label>
          <textarea
            id="inbox-request"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-36 w-full resize-none bg-transparent px-4 py-4 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:px-6 sm:py-5"
            placeholder="Paste source text or ask Hyperlocalise to translate a file, string, or inbox request..."
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <DropdownMenu>
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
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-52" align="start">
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
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
                      <DropdownMenuItem key={option.label}>
                        <HugeiconsIcon icon={option.icon} strokeWidth={1.8} className="size-4" />
                        {option.label}
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
              <Button
                type="button"
                size="icon-sm"
                disabled={!text.trim() || chatRequestMutation.isPending}
                onClick={() => chatRequestMutation.mutate()}
                className="rounded-full bg-foreground text-app-shell-background hover:bg-foreground/90"
                aria-label="Send translation request"
              >
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <TypographyMuted className="mt-5 flex items-center justify-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={1.7} className="size-3.5" />
          Agent can turn inbox requests into translation jobs, glossary updates, or reviewer tasks.
        </TypographyMuted>

        <div className="space-y-1.4 mt-6">
          <TypographyH4>Suggestions</TypographyH4>
          <div className="rounded-xl border border-border/20 bg-muted/5">
            {suggestedRequests.map((request, index) => (
              <div key={request.title}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/10"
                >
                  <HugeiconsIcon
                    icon={request.icon}
                    strokeWidth={1.7}
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0">
                    <TypographySmall className="block text-foreground">
                      {request.title}
                    </TypographySmall>
                    <TypographyMuted className="mt-1 text-muted-foreground">
                      {request.detail}
                    </TypographyMuted>
                  </div>
                </button>
                {index < suggestedRequests.length - 1 ? (
                  <Separator className="bg-border/20" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
