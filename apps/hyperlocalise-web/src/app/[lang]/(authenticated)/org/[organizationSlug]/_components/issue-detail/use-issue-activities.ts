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

export type IssueActivityUser = {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

type IssueActivityBase = {
  id: string;
  actor: IssueActivityUser | null;
  createdAt: string;
};

export type IssueActivity =
  | (IssueActivityBase & {
      type: "assignee_changed";
      previousAssignee: IssueActivityUser | null;
      nextAssignee: IssueActivityUser | null;
    })
  | (IssueActivityBase & {
      type: "issue_created";
    })
  | (IssueActivityBase & {
      type: "status_changed";
      previousStatus: string;
      nextStatus: string;
    });
