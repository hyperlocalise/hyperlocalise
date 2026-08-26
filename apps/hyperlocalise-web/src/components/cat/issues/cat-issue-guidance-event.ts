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
export const CAT_ISSUE_GUIDANCE_OPEN_EVENT = "cat-issue-guidance:open";

export const EMPTY_CAT_ISSUE_GUIDANCE_STATUS = {
  available: false,
  openIssueCount: 0,
} as const;

export type CatIssueGuidanceStatus = {
  available: boolean;
  openIssueCount: number;
};

type CatIssueGuidanceListener = () => void;

let issueGuidanceStatus: CatIssueGuidanceStatus = EMPTY_CAT_ISSUE_GUIDANCE_STATUS;
const issueGuidanceListeners = new Set<CatIssueGuidanceListener>();

export function requestCatIssueGuidance() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CAT_ISSUE_GUIDANCE_OPEN_EVENT));
}

export function setCatIssueGuidanceStatus(status: CatIssueGuidanceStatus) {
  if (
    issueGuidanceStatus.available === status.available &&
    issueGuidanceStatus.openIssueCount === status.openIssueCount
  ) {
    return;
  }

  issueGuidanceStatus = status;
  issueGuidanceListeners.forEach((listener) => listener());
}

export function subscribeCatIssueGuidance(listener: CatIssueGuidanceListener) {
  issueGuidanceListeners.add(listener);
  return () => issueGuidanceListeners.delete(listener);
}

export function getCatIssueGuidanceStatus() {
  return issueGuidanceStatus;
}

export function getCatIssueGuidanceServerSnapshot() {
  return EMPTY_CAT_ISSUE_GUIDANCE_STATUS;
}
