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
import type { MessageDescriptor } from "react-intl";

import {
  contentEditorQueuePanelMessages,
  contentEditorWorkspaceMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import {
  isSourceFileIngestFailed,
  isSourceFileIngestInProgress,
  type SourceFileIngestState,
} from "@/lib/projects/files/source-file-ingest-state";

export function resolveContentEditorQueueEmptyCopy(input: {
  hasSearch: boolean;
  hasActiveFilter: boolean;
  ingestState?: SourceFileIngestState | null;
  ingestError?: string | null;
}): { message: MessageDescriptor; values?: Record<string, string> } {
  if (input.hasSearch) {
    return { message: contentEditorQueuePanelMessages.emptySearchResults };
  }
  if (input.hasActiveFilter) {
    return { message: contentEditorQueuePanelMessages.emptyFilterResults };
  }
  if (isSourceFileIngestInProgress(input.ingestState)) {
    return { message: contentEditorWorkspaceMessages.extractingSegments };
  }
  if (isSourceFileIngestFailed(input.ingestState)) {
    const error = input.ingestError?.trim();
    if (error) {
      return {
        message: contentEditorWorkspaceMessages.ingestFailedWithReason,
        values: { error },
      };
    }
    return { message: contentEditorWorkspaceMessages.ingestFailed };
  }
  return { message: contentEditorWorkspaceMessages.emptyQueue };
}
