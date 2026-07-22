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
export const ISSUE_LIST_VIEWS = ["my_work", "qa_triage", "source_context", "all_open"] as const;
export const ISSUE_LIST_SORT_FIELDS = ["updated_at", "created_at", "priority", "status"] as const;
export const ISSUE_LIST_SORT_DIRECTIONS = ["asc", "desc"] as const;
export const ISSUE_PRIORITIES = ["P0", "P1", "P2"] as const;

export type IssueListView = (typeof ISSUE_LIST_VIEWS)[number];
export type IssueListSortField = (typeof ISSUE_LIST_SORT_FIELDS)[number];
export type IssueListSortDirection = (typeof ISSUE_LIST_SORT_DIRECTIONS)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];
