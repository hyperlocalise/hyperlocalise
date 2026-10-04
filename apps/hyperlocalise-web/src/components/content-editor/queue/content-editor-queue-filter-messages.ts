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
import { contentEditorQueuePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "./content-editor-queue-filter";

type QueuePanelMessage =
  (typeof contentEditorQueuePanelMessages)[keyof typeof contentEditorQueuePanelMessages];

export const queueFilterMessageByValue: Record<ContentEditorQueueFilter, QueuePanelMessage> = {
  all: contentEditorQueuePanelMessages.filterAll,
  untranslated: contentEditorQueuePanelMessages.filterUntranslated,
  needs_review: contentEditorQueuePanelMessages.filterNeedsReview,
  reviewed: contentEditorQueuePanelMessages.filterReviewed,
  unsaved: contentEditorQueuePanelMessages.filterUnsaved,
  qa_issues: contentEditorQueuePanelMessages.filterQaIssues,
  machine_translated: contentEditorQueuePanelMessages.filterMachineTranslated,
  with_comments: contentEditorQueuePanelMessages.filterWithComments,
  has_issues: contentEditorQueuePanelMessages.filterHasIssues,
  skipped: contentEditorQueuePanelMessages.filterSkipped,
  hidden: contentEditorQueuePanelMessages.filterHidden,
};

export const queueSortMessageByValue: Record<ContentEditorQueueSort, QueuePanelMessage> = {
  file_order: contentEditorQueuePanelMessages.sortFileOrder,
  untranslated_first: contentEditorQueuePanelMessages.sortUntranslatedFirst,
};
