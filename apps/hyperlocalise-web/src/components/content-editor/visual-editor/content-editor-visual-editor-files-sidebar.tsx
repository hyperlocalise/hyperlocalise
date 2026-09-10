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

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { ContentEditorFilesSidebar } from "@/components/content-editor/files/content-editor-files-sidebar";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";

import { contentEditorVisualEditorMessages } from "./content-editor-visual-editor.messages";
import type { ContentEditorVisualEditorProgress } from "./content-editor-visual-editor.types";

export function ContentEditorVisualEditorFilesSidebar({
  files,
  selectedSourcePath,
  onSelectFile,
  progress,
  className,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  progress: ContentEditorVisualEditorProgress;
  className?: string;
}) {
  return (
    <ContentEditorFilesSidebar
      files={files}
      selectedSourcePath={selectedSourcePath}
      onSelectFile={onSelectFile}
      className={className}
      footer={
        <div className="space-y-3 px-4 py-4">
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              <FormattedMessage {...contentEditorVisualEditorMessages.progressTitle} />
            </h3>
            <Progress value={progress.percent} className="gap-1.5">
              <ProgressLabel className="text-xs text-foreground">{progress.locale}</ProgressLabel>
              <ProgressValue className="text-xs" />
            </Progress>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/60 px-2 py-2">
              <dt className="text-[10px] text-muted-foreground">
                <FormattedMessage {...contentEditorVisualEditorMessages.translatedCount} />
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-grove-300 tabular-nums">
                {progress.translated}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 px-2 py-2">
              <dt className="text-[10px] text-muted-foreground">
                <FormattedMessage {...contentEditorVisualEditorMessages.inReviewCount} />
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-beam-700 tabular-nums">
                {progress.inReview}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 px-2 py-2">
              <dt className="text-[10px] text-muted-foreground">
                <FormattedMessage {...contentEditorVisualEditorMessages.untranslatedCount} />
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                {progress.untranslated}
              </dd>
            </div>
          </dl>
        </div>
      }
    />
  );
}
