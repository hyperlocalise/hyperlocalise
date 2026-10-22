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

function progressColor(progress: ProjectFileProgressRecord) {
  if (progress.approvalProgress >= 100) return APPROVED_COLOR;
  if (progress.translationProgress > 0) return TRANSLATED_COLOR;
  return MUTED_COLOR;
}

/**
 * Row decoration: a muted "Hidden" marker for files whose strings are all hidden,
 * otherwise the translated % (green once fully approved). The tooltip carries the
 * translated and approved split. Returns null when there is nothing to show so
 * callers can fall back to their own decoration.
 */
export function buildProjectFileProgressDecoration(
  file: ProjectFileRecord,
  progress: ProjectFileProgressRecord | null,
  intl: IntlShape,
): FileTreeRowDecoration | null {
  if (file.isHidden) {
    return {
      text: intl.formatMessage(messages.hidden),
      title: intl.formatMessage(messages.hiddenTitle),
    };
  }

  if (!progress || progress.phrases.total === 0) {
    return null;
  }

  const text = `${progress.translationProgress}%`;
  return {
    text,
    title: intl.formatMessage(messages.progressTitle, {
      translated: progress.translationProgress,
      approved: progress.approvalProgress,
      total: progress.phrases.total,
    }),
    parts: [{ text, color: progressColor(progress) }],
  };
}
