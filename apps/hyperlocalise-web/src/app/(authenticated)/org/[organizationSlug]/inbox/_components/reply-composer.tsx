"use client";

import type { FileUIPart } from "ai";
import { useEffect, useState } from "react";
import {
  Add01Icon,
  AiImageIcon,
  AiWebBrowsingIcon,
  ArrowDown01Icon,
  FileAttachmentIcon,
  FolderLibraryIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";

function dataUrlToFile(dataUrl: string, filename: string, mediaType?: string): File {
  const arr = dataUrl.split(",");
  if (arr.length < 2) {
    throw new Error("Invalid data URL");
  }
  const mime = arr[0].match(/:(.*?);/)?.[1] || mediaType || "application/octet-stream";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

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

export function ReplyComposer({
  conversationProjectId,
  disabled,
  isStreaming,
  onSend,
  organizationSlug,
}: {
  conversationProjectId: string | null;
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string, files: File[]) => void | Promise<void>;
  organizationSlug: string;
}) {
  const [replyText, setReplyText] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(conversationProjectId ?? "");

  useEffect(() => {
    setSelectedProjectId(conversationProjectId ?? "");
  }, [conversationProjectId]);

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

  const attachments = usePromptInputAttachments();

  const sendReply = (text: string, files: FileUIPart[]) => {
    const trimmedText = text.trim();
    if ((!trimmedText && files.length === 0) || disabled) return;

    const fileObjects = files.map((file) =>
      dataUrlToFile(file.url, file.filename || "untitled", file.mediaType),
    );

    void onSend(trimmedText, fileObjects);
    setReplyText("");
    attachments.clear();
  };

  return (
    <section className="sticky bottom-0 z-20 shrink-0 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <PromptInput
          onSubmit={({ text, files }) => sendReply(text, files)}
          className="overflow-hidden rounded-[1.35rem] border border-border bg-app-shell-background text-foreground shadow-2xl shadow-black/10 [&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:rounded-[1.35rem] [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent"
        >
          <PromptInputBody>
            {attachments.files.length > 0 && (
              <div className="px-4 pt-3 sm:px-6">
                <Attachments variant="inline">
                  {attachments.files.map((file) => (
                    <Attachment
                      key={file.id}
                      data={file}
                      onRemove={() => attachments.remove(file.id)}
                    >
                      <AttachmentPreview />
                      <AttachmentInfo />
                      <AttachmentRemove />
                    </Attachment>
                  ))}
                </Attachments>
              </div>
            )}
            <PromptInputTextarea
              disabled={disabled}
              onChange={(event) => setReplyText(event.currentTarget.value)}
              className="min-h-24 px-4 py-4 text-base leading-6 sm:px-6 sm:py-5"
              placeholder={
                isStreaming
                  ? "Agent is responding..."
                  : "Paste source text or ask Hyperlocalise to translate a file, string, or inbox request..."
              }
              rows={1}
            />
          </PromptInputBody>
          <PromptInputFooter className="flex-wrap gap-3 border-t border-border bg-muted px-4 py-3 sm:px-5">
            <PromptInputTools className="flex-wrap gap-2 text-sm text-muted-foreground">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <PromptInputButton
                      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
                      size="icon-sm"
                      aria-label="Add translation context"
                    />
                  }
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-52" align="start">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => attachments.openFileDialog()}>
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
            </PromptInputTools>

            <PromptInputTools className="flex-wrap justify-end gap-2 text-sm text-muted-foreground">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <PromptInputButton
                      className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
                      size="sm"
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
              <PromptInputSubmit
                size="sm"
                disabled={(!replyText.trim() && attachments.files.length === 0) || disabled}
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                aria-label="Send reply"
              >
                <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
                Send
              </PromptInputSubmit>
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}
