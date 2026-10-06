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
import type { ContentEditorAdvancedQueueFilter } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

const WHOLE_FILE_ASSET_KINDS = new Set(["image_file", "video_file"]);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type WholeFileQueueSubject = {
  contentKind: string;
  hasTarget: boolean;
  approvalStatus?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

function wholeFileStringTypeMatches(contentKind: string, stringType: string | undefined) {
  if (!stringType) {
    return true;
  }
  if (stringType === "asset") {
    return WHOLE_FILE_ASSET_KINDS.has(contentKind);
  }
  return false;
}

function wholeFileTranslationMatches(hasTarget: boolean, translationStatus: string | undefined) {
  if (!translationStatus) {
    return true;
  }
  if (translationStatus === "untranslated") {
    return !hasTarget;
  }
  return hasTarget;
}

function wholeFileApprovalMatches(
  hasTarget: boolean,
  approvalStatus: string | null | undefined,
  filterStatus: string | undefined,
) {
  if (!filterStatus) {
    return true;
  }
  if (filterStatus === "approved") {
    return approvalStatus === "approved";
  }
  return hasTarget && approvalStatus !== "approved";
}

function utcDayStart(date: string) {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function wholeFileDateMatches(at: Date | null | undefined, from?: string, to?: string) {
  if (!from && !to) {
    return true;
  }
  if (!at || Number.isNaN(at.getTime())) {
    return false;
  }
  const timestamp = at.getTime();
  if (from && timestamp < utcDayStart(from)) {
    return false;
  }
  if (to && timestamp >= utcDayStart(to) + MILLISECONDS_PER_DAY) {
    return false;
  }
  return true;
}

export function wholeFileMatchesAdvancedQueueFilter(
  subject: WholeFileQueueSubject,
  filter: ContentEditorAdvancedQueueFilter | null | undefined,
) {
  if (!filter) {
    return true;
  }
  if (!wholeFileStringTypeMatches(subject.contentKind, filter.stringType)) {
    return false;
  }
  if (!wholeFileTranslationMatches(subject.hasTarget, filter.translationStatus)) {
    return false;
  }
  if (!wholeFileApprovalMatches(subject.hasTarget, subject.approvalStatus, filter.approvalStatus)) {
    return false;
  }
  if (filter.qaIssues === "with" || filter.qaIssueType) {
    return false;
  }
  if (filter.comments === "with" || filter.screenshots === "with") {
    return false;
  }
  if ((filter.includeLabelIds?.length ?? 0) > 0 || (filter.excludeLabelIds?.length ?? 0) > 0) {
    return false;
  }
  if (filter.visibility === "hidden") {
    return false;
  }
  if (!wholeFileDateMatches(subject.createdAt, filter.addedFrom, filter.addedTo)) {
    return false;
  }
  if (!wholeFileDateMatches(subject.updatedAt, filter.updatedFrom, filter.updatedTo)) {
    return false;
  }
  return true;
}
