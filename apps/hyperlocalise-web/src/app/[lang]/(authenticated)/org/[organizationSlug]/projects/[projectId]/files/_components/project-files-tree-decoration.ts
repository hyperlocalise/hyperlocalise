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
import type { FileTreeRowDecoration } from "@pierre/trees";
import type { IntlShape } from "react-intl";

import type {
  ProjectFileProgressRecord,
  ProjectFileRecord,
} from "@/api/routes/project/project.schema";

import { projectFilesTreeMessages as messages } from "./project-files-tree.messages";

const TRANSLATED_COLOR = "var(--ds-blue-900)";
const APPROVED_COLOR = "var(--ds-green-900)";
const MUTED_COLOR = "var(--muted-foreground)";

export type ProjectFileProgressLookup = {
  bySourcePath: Map<string, ProjectFileProgressRecord>;
  byExternalResourceId: Map<string, ProjectFileProgressRecord>;
};

export function buildProjectFileProgressLookup(
  progress: readonly ProjectFileProgressRecord[],
): ProjectFileProgressLookup {
  const lookup: ProjectFileProgressLookup = {
    bySourcePath: new Map(),
    byExternalResourceId: new Map(),
  };
  for (const row of progress) {
    if (row.sourcePath) lookup.bySourcePath.set(row.sourcePath, row);
    if (row.externalResourceId) lookup.byExternalResourceId.set(row.externalResourceId, row);
  }
  return lookup;
}

export function findProjectFileProgress(
  lookup: ProjectFileProgressLookup,
  file: ProjectFileRecord,
) {
  const externalResourceId = file.provider?.externalResourceId;
  return (
    (externalResourceId ? lookup.byExternalResourceId.get(externalResourceId) : undefined) ??
    lookup.bySourcePath.get(file.sourcePath) ??
    null
  );
}

function percentColor(percent: number, color: string) {
  return percent > 0 ? color : MUTED_COLOR;
}

/**
 * Crowdin-style row decoration: translated % in blue, approved % in green, and a
 * muted marker for files whose strings are all hidden. Returns null when there is
 * nothing to show so callers can fall back to their own decoration.
 */
export function buildProjectFileProgressDecoration(
  file: ProjectFileRecord,
  progress: ProjectFileProgressRecord | null,
  intl: IntlShape,
): FileTreeRowDecoration | null {
  const hiddenLabel = intl.formatMessage(messages.hidden);
  const hiddenTitle = intl.formatMessage(messages.hiddenTitle);

  if (!progress) {
    return file.isHidden ? { text: hiddenLabel, title: hiddenTitle } : null;
  }

  const translated = `${progress.translationProgress}%`;
  const approved = `${progress.approvalProgress}%`;
  const parts = [
    ...(file.isHidden ? [{ text: `${hiddenLabel} · `, color: MUTED_COLOR }] : []),
    { text: translated, color: percentColor(progress.translationProgress, TRANSLATED_COLOR) },
    { text: " · ", color: MUTED_COLOR },
    { text: approved, color: percentColor(progress.approvalProgress, APPROVED_COLOR) },
  ];
  const progressTitle =
    progress.phrases.total === 0
      ? intl.formatMessage(messages.progressEmptyTitle)
      : intl.formatMessage(messages.progressTitle, {
          translated: progress.translationProgress,
          approved: progress.approvalProgress,
          total: progress.phrases.total,
        });

  return {
    text: parts.map((part) => part.text).join(""),
    title: file.isHidden ? `${hiddenTitle}\n${progressTitle}` : progressTitle,
    parts,
  };
}
