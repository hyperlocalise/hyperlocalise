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
import type {
  LocalisationAuditReport,
  LocalisationAuditStatus,
  LocalisationAuditTeaser,
} from "./types";
import { LOCALISATION_AUDIT_USER_AGENT_NAME } from "./user-agent";

const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 299;

export function isSuccessfulLocalisationAuditPageStatus(status: number) {
  return status >= HTTP_SUCCESS_MIN && status <= HTTP_SUCCESS_MAX;
}

/**
 * A score is only publishable when at least one crawled page returned 2xx.
 * Audits scored before blocked detection shipped can hold reports built
 * entirely from 403 / challenge pages.
 */
export function hasLocalisationAuditSuccessfulPage(
  pages: ReadonlyArray<{ status: number }> | null | undefined,
) {
  return (pages ?? []).some((page) => isSuccessfulLocalisationAuditPageStatus(page.status));
}

type PublishableLocalisationAudit = {
  status: string;
  score: number | null;
  teaser: LocalisationAuditTeaser | null;
  report: LocalisationAuditReport | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/**
 * Presents a succeeded audit whose report has no 2xx page as blocked so its
 * score never reaches public pages, emails, or the leaderboard.
 */
export function asPublishedLocalisationAudit<T extends PublishableLocalisationAudit>(audit: T): T {
  if (
    audit.status !== "succeeded" ||
    audit.report == null ||
    hasLocalisationAuditSuccessfulPage(audit.report.pages)
  ) {
    return audit;
  }
  return {
    ...audit,
    status: "blocked" satisfies LocalisationAuditStatus,
    score: null,
    teaser: null,
    report: null,
    errorCode: "crawl_blocked",
    errorMessage: `This domain blocked ${LOCALISATION_AUDIT_USER_AGENT_NAME}, so the last run could not score it. Allow it through your firewall, CDN, bot protection, or login wall, then start a new audit.`,
  };
}
