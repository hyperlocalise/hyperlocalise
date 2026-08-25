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
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { readApiError } from "@/lib/api-error";

import { getKnowledgeMemory, knowledgeMemoryQueryKey } from "./knowledge-memory-api";
import { KnowledgeMemoryEditor } from "./knowledge-memory-editor";
import type { LoadedKnowledgeMemory } from "./knowledge-memory-query";
import { KnowledgePageHeader, type KnowledgePageMode } from "./knowledge-page-view";
import { KnowledgePageSkeleton } from "./knowledge-page-skeleton";
import { KnowledgeUploadSection } from "./knowledge-upload-section";

export function KnowledgePageContent({
  organizationSlug,
  projectId,
  canUpdateKnowledgeMemory,
}: {
  organizationSlug: string;
  projectId?: string;
  canUpdateKnowledgeMemory: boolean;
}) {
  const [viewMode, setViewMode] = useState<KnowledgePageMode | null>(null);
  const [draftSeed, setDraftSeed] = useState<string | undefined>(undefined);
  const [editorMountKey, setEditorMountKey] = useState(0);
  const isAddingSources = useRef(false);

  const knowledgeMemoryQuery = useQuery({
    queryKey: knowledgeMemoryQueryKey(organizationSlug, projectId),
    queryFn: async () => {
      const response = await getKnowledgeMemory({ organizationSlug, projectId });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Unable to load knowledge memory"));
      }

      const body = await response.json();
      return {
        knowledgeMemory: body.knowledgeMemory,
        etag: response.headers.get("etag") ?? '"0"',
      } satisfies LoadedKnowledgeMemory;
    },
  });

  const savedContent = knowledgeMemoryQuery.data?.knowledgeMemory.content ?? "";
  const hasExistingKnowledge = savedContent.length > 0;

  useEffect(() => {
    if (
      !knowledgeMemoryQuery.data ||
      (viewMode !== null &&
        (viewMode !== "upload" || !hasExistingKnowledge || isAddingSources.current))
    ) {
      return;
    }

    setViewMode(hasExistingKnowledge ? "editor" : "upload");
  }, [hasExistingKnowledge, knowledgeMemoryQuery.data, viewMode]);

  const openEditor = (seed?: string) => {
    isAddingSources.current = false;
    if (typeof seed === "string") {
      setDraftSeed(seed);
      setEditorMountKey((value) => value + 1);
    }
    setViewMode("editor");
  };

  const resolvedMode: KnowledgePageMode =
    knowledgeMemoryQuery.isLoading || viewMode === null ? "loading" : viewMode;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <KnowledgePageHeader
        scope={projectId ? "project" : "organization"}
        onAddSources={
          resolvedMode === "editor"
            ? () => {
                isAddingSources.current = true;
                setViewMode("upload");
              }
            : undefined
        }
      />

      {resolvedMode === "loading" ? <KnowledgePageSkeleton /> : null}

      {resolvedMode === "upload" ? (
        <KnowledgeUploadSection onStartMarkdownText={() => openEditor()} />
      ) : null}

      {resolvedMode !== "loading" ? (
        <div className={resolvedMode === "editor" ? undefined : "hidden"}>
          <KnowledgeMemoryEditor
            key={editorMountKey}
            organizationSlug={organizationSlug}
            projectId={projectId}
            canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
            initialDraftContent={draftSeed}
          />
        </div>
      ) : null}
    </div>
  );
}
