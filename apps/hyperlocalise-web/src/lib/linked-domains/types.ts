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
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";
import type {
  LinkedDomainStatus,
  LinkedDomainVerificationMethod,
} from "@/lib/database/schema/linked-domains";

export type LinkedDomainPublic = {
  id: string;
  organizationId: string;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  marketIds: string[];
  status: LinkedDomainStatus;
  preferredMethod: LinkedDomainVerificationMethod | null;
  verifiedMethod: LinkedDomainVerificationMethod | null;
  verifiedAt: string | null;
  localisationAuditId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  challenges: LinkedDomainChallenges;
  /** Present when the linked domain has an attached localisation audit. */
  auditScore: number | null;
};

export type LinkedDomainAuditDetail = {
  id: string;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  status: string;
  score: number | null;
  completedAt: string | null;
  teaser: LocalisationAuditTeaser | null;
  report: LocalisationAuditReport | null;
};

export type LinkedDomainChallenges = {
  token: string;
  dnsTxt: {
    host: string;
    value: string;
  };
  htmlFile: {
    path: string;
    url: string;
    body: string;
  };
  metaTag: {
    html: string;
  };
};
