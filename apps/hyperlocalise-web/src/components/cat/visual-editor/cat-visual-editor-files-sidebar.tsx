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
import { ProjectFilesTree } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files-tree";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { cn } from "@/lib/primitives/cn";

import { catVisualEditorMessages } from "./cat-visual-editor.messages";
import type { CatVisualEditorProgress } from "./cat-visual-editor.types";

export function CatVisualEditorFilesSidebar({
  files,
  selectedSourcePath,
  onSelectFile,
  progress,
  className,
}: {
  files: ProjectFileRecord[];
  selectedSourcePath: string | null;
  onSelectFile: (sourcePath: string) => void;
  progress: CatVisualEditorProgress;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-r border-border bg-background",
        className,
      )}
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          <FormattedMessage {...catVisualEditorMessages.filesTitle} />
        </h2>
      </div>

      <div className="min-h-0 flex-1 px-2 py-2">
        <ProjectFilesTree
          files={files}
          selectedSourcePath={selectedSourcePath}
          onSelectFile={onSelectFile}
          fillHeight
        />
      </div>

      <div className="space-y-3 border-t border-border px-4 py-4">
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            <FormattedMessage {...catVisualEditorMessages.progressTitle} />
          </h3>
          <Progress value={progress.percent} className="gap-1.5">
            <ProgressLabel className="text-xs text-foreground">{progress.locale}</ProgressLabel>
            <ProgressValue className="text-xs" />
          </Progress>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/60 px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">
              <FormattedMessage {...catVisualEditorMessages.translatedCount} />
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-grove-300 tabular-nums">
              {progress.translated}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">
              <FormattedMessage {...catVisualEditorMessages.inReviewCount} />
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-amber-700 tabular-nums dark:text-amber-400">
              {progress.inReview}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">
              <FormattedMessage {...catVisualEditorMessages.untranslatedCount} />
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
              {progress.untranslated}
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
