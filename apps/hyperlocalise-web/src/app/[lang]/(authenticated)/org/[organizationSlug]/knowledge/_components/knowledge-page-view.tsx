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
import { PlusIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

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
}: {
  onAddSources?: () => void;
  scope?: KnowledgeMemoryScope;
}) {
  return (
    <header className="flex flex-wrap items-center justify-end gap-2">
      <h1 className="sr-only">
        <FormattedMessage {...knowledgePageViewMessages.title} />
      </h1>
      {onAddSources ? (
        <Button type="button" variant="outline" size="sm" onClick={onAddSources}>
          <PlusIcon data-icon="inline-start" />
          <FormattedMessage {...knowledgeMemoryEditorMessages.addSources} />
        </Button>
      ) : null}
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
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
