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
import { useState } from "react";
import { FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { HistoryIcon } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";

import type { KnowledgeMemoryRecord } from "@/api/routes/knowledge-memory/knowledge-memory.schema";
import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";
import { cn } from "@/lib/primitives/cn";

import { knowledgeMemoryEditorMessages } from "./knowledge-memory-editor.messages";
import { KnowledgePageSkeleton } from "./knowledge-page-skeleton";

function formatUpdatedAt(value: string | null, notSavedYet: string) {
  if (!value) {
    return notSavedYet;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

export type KnowledgeMemoryEditorViewProps = {
  content: string;
  onContentChange: (value: string) => void;
  summary: string;
  onSummaryChange: (value: string) => void;
  savedKnowledgeMemory: KnowledgeMemoryRecord | null;
  characterCount: number;
  characterLimit: number;
  isOverLimit: boolean;
  hasChanges: boolean;
  canSave: boolean;
  canUpdateKnowledgeMemory: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onOpenHistory: () => void;
  onSubmit: () => Promise<void>;
};

export function KnowledgeMemoryEditorView({
  content,
  onContentChange,
  summary,
  onSummaryChange,
  savedKnowledgeMemory,
  characterCount,
  characterLimit,
  isOverLimit,
  hasChanges,
  canSave,
  canUpdateKnowledgeMemory,
  isLoading,
  isSaving,
  onOpenHistory,
  onSubmit,
}: KnowledgeMemoryEditorViewProps) {
  const intl = useIntl();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  if (isLoading) {
    return <KnowledgePageSkeleton />;
  }

  return (
    <>
      <section className="flex min-h-[34rem] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <h2 className="text-sm font-medium tracking-tight text-foreground">
            <FormattedMessage {...knowledgeMemoryEditorMessages.title} />
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <FormattedMessage
                {...knowledgeMemoryEditorMessages.lastUpdated}
                values={{
                  timestamp: formatUpdatedAt(
                    savedKnowledgeMemory?.updatedAt ?? null,
                    intl.formatMessage(knowledgeMemoryEditorMessages.notSavedYet),
                  ),
                }}
              />
            </span>
            {savedKnowledgeMemory?.version ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  <FormattedMessage
                    {...knowledgeMemoryEditorMessages.version}
                    values={{ version: savedKnowledgeMemory.version }}
                  />
                </span>
              </>
            ) : null}
          </div>
        </div>
        <Separator />

        <div className="flex flex-1 flex-col">
          <Field data-invalid={isOverLimit} className="flex-1 gap-2">
            <MarkdownEditor
              value={content}
              onChange={onContentChange}
              disabled={!canUpdateKnowledgeMemory}
              chrome="minimal"
              ariaLabel={intl.formatMessage(knowledgeMemoryEditorMessages.memoryAriaLabel)}
              placeholder={intl.formatMessage(knowledgeMemoryEditorMessages.memoryPlaceholder)}
              className={cn(
                "px-1 py-6",
                "[&_.tiptap]:min-h-[24rem] [&_.tiptap]:text-[15px] [&_.tiptap]:leading-7",
              )}
            />
            {isOverLimit ? (
              <FieldError>
                <FormattedMessage
                  {...knowledgeMemoryEditorMessages.overLimitError}
                  values={{ limit: characterLimit }}
                />
              </FieldError>
            ) : null}
          </Field>

          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                <FormattedMessage
                  {...knowledgeMemoryEditorMessages.characterCount}
                  values={{ count: characterCount, limit: characterLimit }}
                />
              </span>
              <span aria-hidden>·</span>
              <span className={cn(hasChanges && "text-foreground")}>
                <FormattedMessage
                  {...(hasChanges
                    ? knowledgeMemoryEditorMessages.unsavedChanges
                    : knowledgeMemoryEditorMessages.changesSaved)}
                />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onOpenHistory}>
                <HistoryIcon data-icon="inline-start" />
                <FormattedMessage {...knowledgeMemoryEditorMessages.history} />
              </Button>
              {canUpdateKnowledgeMemory ? (
                <Button type="button" disabled={!canSave} onClick={() => setSaveDialogOpen(true)}>
                  <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={1.8} data-icon="inline-start" />
                  {isSaving ? (
                    <FormattedMessage {...knowledgeMemoryEditorMessages.committing} />
                  ) : (
                    <FormattedMessage {...knowledgeMemoryEditorMessages.commitChanges} />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <form
            className="flex flex-col gap-6"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await onSubmit();
                setSaveDialogOpen(false);
              } catch {
                // The mutation reports the error and leaves the dialog open for retry.
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <FormattedMessage {...knowledgeMemoryEditorMessages.saveDialogTitle} />
              </DialogTitle>
              <DialogDescription>
                <FormattedMessage {...knowledgeMemoryEditorMessages.saveDialogDescription} />
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="knowledge-memory-summary">
                <FormattedMessage {...knowledgeMemoryEditorMessages.versionNoteLabel} />
              </FieldLabel>
              <Input
                id="knowledge-memory-summary"
                value={summary}
                maxLength={KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH}
                autoFocus
                onChange={(event) => onSummaryChange(event.target.value)}
                placeholder={intl.formatMessage(
                  knowledgeMemoryEditorMessages.versionNotePlaceholder,
                )}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveDialogOpen(false)}>
                <FormattedMessage {...knowledgeMemoryEditorMessages.cancel} />
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <FormattedMessage {...knowledgeMemoryEditorMessages.committing} />
                ) : (
                  <FormattedMessage {...knowledgeMemoryEditorMessages.saveVersion} />
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
