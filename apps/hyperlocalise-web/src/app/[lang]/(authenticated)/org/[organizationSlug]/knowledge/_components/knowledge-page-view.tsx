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
import { FormattedMessage } from "react-intl";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

import {
  KnowledgeMemoryEditorView,
  type KnowledgeMemoryEditorViewProps,
  type KnowledgeMemoryScope,
} from "./knowledge-memory-editor-view";
import { knowledgeMemoryEditorMessages } from "./knowledge-memory-editor.messages";
import { KnowledgePageSkeleton } from "./knowledge-page-skeleton";
import { knowledgePageViewMessages } from "./knowledge-page-view.messages";
import { KnowledgeUploadSection } from "./knowledge-upload-section";

export type KnowledgePageMode = "loading" | "upload" | "editor";

export type KnowledgePageViewProps = {
  mode: KnowledgePageMode;
  scope?: KnowledgeMemoryScope;
  onStartMarkdownText: () => void;
  onAddSources?: () => void;
  onFilesSelected?: (files: File[]) => void;
  editor?: KnowledgeMemoryEditorViewProps;
};

export function KnowledgePageHeader({
  onAddSources,
  scope = "organization",
}: {
  onAddSources?: () => void;
  scope?: KnowledgeMemoryScope;
}) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>
          <FormattedMessage
            {...(scope === "project"
              ? knowledgePageViewMessages.project
              : knowledgePageViewMessages.workspace)}
          />
        </span>
        <span aria-hidden>/</span>
        <span className="text-foreground">
          <FormattedMessage {...knowledgePageViewMessages.title} />
        </span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <TypographyH1 className="text-2xl tracking-[-0.02em] md:text-2xl">
            <FormattedMessage {...knowledgePageViewMessages.title} />
          </TypographyH1>
          <TypographyP className="max-w-2xl leading-6" size="small" tone="subtle">
            <FormattedMessage
              {...(scope === "project"
                ? knowledgePageViewMessages.projectDescription
                : knowledgePageViewMessages.description)}
            />
          </TypographyP>
        </div>
        {onAddSources ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddSources}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} data-icon="inline-start" />
            <FormattedMessage {...knowledgeMemoryEditorMessages.addSources} />
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export function KnowledgePageView({
  mode,
  scope = "organization",
  onStartMarkdownText,
  onAddSources,
  onFilesSelected,
  editor,
}: KnowledgePageViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <KnowledgePageHeader
        scope={scope}
        onAddSources={mode === "editor" ? onAddSources : undefined}
      />

      {mode === "loading" ? <KnowledgePageSkeleton /> : null}

      {mode === "upload" ? (
        <KnowledgeUploadSection
          onStartMarkdownText={onStartMarkdownText}
          onFilesSelected={onFilesSelected}
        />
      ) : null}

      {mode === "editor" && editor ? <KnowledgeMemoryEditorView {...editor} /> : null}
    </div>
  );
}
