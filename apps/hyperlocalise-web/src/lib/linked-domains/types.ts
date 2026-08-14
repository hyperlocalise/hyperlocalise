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
  LinkedDomainStatus,
  LinkedDomainVerificationMethod,
} from "@/lib/database/schema/linked-domains";

export type LinkedDomainErrorCode =
  | "audit_not_found"
  | "audit_not_ready"
  | "domain_already_claimed"
  | "claim_pending_exists"
  | "linked_domain_not_found"
  | "linked_domain_not_pending"
  | "verification_not_found"
  | "verification_fetch_failed"
  | "verification_mismatch"
  | "invalid_domain_slug"
  | "project_create_failed";

export type LinkedDomainError = {
  code: LinkedDomainErrorCode;
  message: string;
};

export type LinkedDomainPublic = {
  id: string;
  organizationId: string;
  domainKey: string;
  domainSlug: string;
  sourceUrl: string;
  status: LinkedDomainStatus;
  preferredMethod: LinkedDomainVerificationMethod | null;
  verifiedMethod: LinkedDomainVerificationMethod | null;
  verifiedAt: string | null;
  localisationAuditId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  challenges: LinkedDomainChallenges;
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

export const LINKED_DOMAIN_TOKEN_PREFIX = "hyperlocalise-site-verification=";
export const LINKED_DOMAIN_DNS_HOST_PREFIX = "_hyperlocalise-verify.";
export const LINKED_DOMAIN_HTML_PATH = "/.well-known/hyperlocalise-verification.txt";
export const LINKED_DOMAIN_META_NAME = "hyperlocalise-site-verification";
