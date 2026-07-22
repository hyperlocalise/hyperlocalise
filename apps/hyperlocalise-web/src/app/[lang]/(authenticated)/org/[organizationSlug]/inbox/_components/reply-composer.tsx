"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { FileUIPart } from "ai";
import { memo, useEffect, useState } from "react";
import { FileAttachmentIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { apiClient } from "@/lib/api-client-instance";

import { RepositorySelector } from "../../_components/repository-selector";
import { createInboxApi, type InboxApi, type InboxGithubRepository } from "./inbox-api";
import { replyComposerMessages } from "./reply-composer.messages";

const inboxApi = createInboxApi(apiClient);

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

type ReplyComposerViewProps = {
  disabled: boolean;
  draft?: string;
  isStreaming: boolean;
  onDraftChange?: (draft: string) => void;
  onSend: (
    text: string,
    files: File[],
    options?: { projectId?: string; repositoryFullName?: string },
  ) => void | Promise<void>;
  placeholder?: string;
  repositories: InboxGithubRepository[];
  repositoriesIsError: boolean;
  repositoriesIsLoading: boolean;
  variant?: "default" | "compact";
};

export function ReplyComposerView({
  disabled,
  draft = "",
  isStreaming,
  onDraftChange,
  onSend,
  placeholder,
  repositories,
  repositoriesIsError,
  repositoriesIsLoading,
  variant = "default",
}: ReplyComposerViewProps) {
  const intl = useIntl();
  const [replyText, setReplyText] = useState(draft);
  const [selectedRepositoryFullName, setSelectedRepositoryFullName] = useState("");
  const promptInputController = usePromptInputController();
  // Stable across keystrokes; the controller object itself is recreated whenever
  // textInput changes, so it must not be an effect dependency.
  const setInput = promptInputController.textInput.setInput;
  const addAttachmentsLabel = intl.formatMessage(replyComposerMessages.addAttachments);
  const sendReplyLabel = intl.formatMessage(replyComposerMessages.sendReply);

  // Sync only when the external draft prop changes (e.g. suggestion chips).
  // Depending on the controller identity or local replyText re-ran this on every
  // keystroke and reset the textarea when draft lagged one render behind.
  useEffect(() => {
    setReplyText(draft);
    setInput(draft);
  }, [draft, setInput]);

  useEffect(() => {
    if (
      selectedRepositoryFullName &&
      !repositories.some((repository) => repository.fullName === selectedRepositoryFullName)
    ) {
      setSelectedRepositoryFullName("");
    }
  }, [repositories, selectedRepositoryFullName]);

  const resolvedRepositoryFullName =
    selectedRepositoryFullName || (repositories.length === 1 ? repositories[0]?.fullName : "");

  const attachments = usePromptInputAttachments();

  const sendReply = async (text: string, files: FileUIPart[]) => {
    const trimmedText = text.trim();
    if ((!trimmedText && files.length === 0) || disabled) return;

    const fileObjects = files.map((file) =>
      dataUrlToFile(
        file.url,
        file.filename || intl.formatMessage(replyComposerMessages.untitledFile),
        file.mediaType,
      ),
    );

    await onSend(trimmedText, fileObjects, {
      repositoryFullName: resolvedRepositoryFullName || undefined,
    });
    setReplyText("");
    onDraftChange?.("");
    attachments.clear();
  };

  return (
    <section
      className={
        variant === "compact"
          ? "sticky bottom-0 z-20 shrink-0 border-t border-border bg-background p-3"
          : "sticky bottom-0 z-20 shrink-0 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6"
      }
    >
      <div className="mx-auto w-full max-w-4xl">
        <PromptInput
          onSubmit={({ text, files }) => sendReply(text, files)}
          className={
            variant === "compact"
              ? "overflow-hidden rounded-xl border border-border bg-muted/30 text-foreground shadow-sm [&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:rounded-xl [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent"
              : "overflow-hidden rounded-[1.35rem] border border-border bg-background text-foreground shadow-2xl shadow-black/10 [&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:rounded-[1.35rem] [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent"
          }
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
              onChange={(event) => {
                const next = event.currentTarget.value;
                setReplyText(next);
                onDraftChange?.(next);
              }}
              className={
                variant === "compact"
                  ? "min-h-12 max-h-28 px-3 py-3 text-sm leading-5"
                  : "min-h-24 px-4 py-4 text-base leading-6 sm:px-6 sm:py-5"
              }
              placeholder={
                isStreaming
                  ? intl.formatMessage(replyComposerMessages.streamingPlaceholder)
                  : (placeholder ?? intl.formatMessage(replyComposerMessages.defaultPlaceholder))
              }
              rows={1}
            />
          </PromptInputBody>
          <PromptInputFooter
            className={
              variant === "compact"
                ? "min-h-10 flex-wrap gap-2 border-0 bg-transparent px-2 pb-2 sm:flex-nowrap"
                : "flex-wrap gap-3 border-t border-border bg-muted px-4 py-3 sm:px-5"
            }
          >
            <PromptInputTools className="flex-wrap gap-2 text-sm text-muted-foreground">
              <PromptInputButton
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
                size="icon-sm"
                aria-label={addAttachmentsLabel}
                tooltip={addAttachmentsLabel}
                onClick={() => attachments.openFileDialog()}
              >
                <HugeiconsIcon icon={FileAttachmentIcon} strokeWidth={1.8} className="size-4" />
              </PromptInputButton>
            </PromptInputTools>

            <PromptInputTools className="flex-wrap justify-end gap-2 text-sm text-muted-foreground">
              <RepositorySelector
                repositories={repositories}
                repositoriesIsError={repositoriesIsError}
                repositoriesIsLoading={repositoriesIsLoading}
                selectedRepositoryFullName={resolvedRepositoryFullName}
                onSelectRepository={setSelectedRepositoryFullName}
                triggerStyle="prompt-input"
              />
              <PromptInputSubmit
                size="sm"
                disabled={(!replyText.trim() && attachments.files.length === 0) || disabled}
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                aria-label={sendReplyLabel}
                tooltip={{
                  content: sendReplyLabel,
                  shortcut: "Enter",
                }}
              >
                <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
                <FormattedMessage {...replyComposerMessages.send} />
              </PromptInputSubmit>
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}

type ReplyComposerProps = Omit<
  ReplyComposerViewProps,
  "repositories" | "repositoriesIsError" | "repositoriesIsLoading"
> & {
  organizationSlug: string;
  inboxApi?: InboxApi;
};

export const ReplyComposer = memo(function ReplyComposer({
  organizationSlug,
  inboxApi: injectedInboxApi = inboxApi,
  draft,
  ...viewProps
}: ReplyComposerProps) {
  const repositoriesQuery = useQuery({
    queryKey: ["github-repositories", organizationSlug],
    queryFn: () => injectedInboxApi.listGithubRepositories(organizationSlug),
  });

  return (
    <PromptInputProvider initialInput={draft ?? ""}>
      <ReplyComposerView
        {...viewProps}
        draft={draft}
        repositories={repositoriesQuery.data ?? []}
        repositoriesIsError={repositoriesQuery.isError}
        repositoriesIsLoading={repositoriesQuery.isLoading}
      />
    </PromptInputProvider>
  );
});
