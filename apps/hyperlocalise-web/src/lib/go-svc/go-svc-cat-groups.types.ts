/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export interface CatStringGroup {
  id: string;
  sourceText: string;
  occurrenceCount: number;
  matchingCount: number;
  translationVariants: number;
  translatedCount: number;
  approvedCount: number;
  lockedCount: number;
}

export interface CatStringGroupMember {
  id: string;
  key: string;
  sourcePath: string;
  context: string | null;
  maxLength: number | null;
  targetText: string;
  status: string;
  isHidden: boolean;
  isLocked: boolean;
  matchesFilter: boolean;
  sourceRevision: string;
  translationRevision: string;
}

export interface CatGroupPagination {
  offset: number;
  limit: number;
  returnedCount: number;
  totalCount: number;
  hasMore: boolean;
}

export interface CatStringGroupsQuery {
  sourcePath: string;
  targetLocale: string;
  sourcePaths?: string;
  search?: string;
  queueFilter?: "all" | "untranslated" | "needs_review" | "reviewed" | "has_issues" | "hidden";
  queueSort?: "file_order" | "untranslated_first";
  offset?: number;
  limit?: number;
  /** Source text from the selected group; narrows member queries in large projects. */
  groupSourceText?: string;
}
