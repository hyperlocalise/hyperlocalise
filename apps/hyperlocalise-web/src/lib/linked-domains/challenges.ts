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
import { randomBytes } from "node:crypto";

import {
  LINKED_DOMAIN_DNS_HOST_PREFIX,
  LINKED_DOMAIN_HTML_PATH,
  LINKED_DOMAIN_META_NAME,
  LINKED_DOMAIN_TOKEN_PREFIX,
  type LinkedDomainChallenges,
} from "./types";

export function mintLinkedDomainVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export function linkedDomainDnsTxtHost(domainKey: string): string {
  return `${LINKED_DOMAIN_DNS_HOST_PREFIX}${domainKey}`;
}

export function linkedDomainDnsTxtValue(token: string): string {
  return `${LINKED_DOMAIN_TOKEN_PREFIX}${token}`;
}

export function linkedDomainMetaTagHtml(token: string): string {
  return `<meta name="${LINKED_DOMAIN_META_NAME}" content="${token}" />`;
}

export function buildLinkedDomainChallenges(input: {
  domainKey: string;
  sourceUrl: string;
  token: string;
}): LinkedDomainChallenges {
  const origin = new URL(input.sourceUrl).origin;
  return {
    token: input.token,
    dnsTxt: {
      host: linkedDomainDnsTxtHost(input.domainKey),
      value: linkedDomainDnsTxtValue(input.token),
    },
    htmlFile: {
      path: LINKED_DOMAIN_HTML_PATH,
      url: `${origin}${LINKED_DOMAIN_HTML_PATH}`,
      body: input.token,
    },
    metaTag: {
      html: linkedDomainMetaTagHtml(input.token),
    },
  };
}

/** True when a DNS TXT string contains our verification token (exact or prefixed). */
export function dnsTxtRecordMatchesToken(record: string, token: string): boolean {
  const trimmed = record.trim().replace(/^"|"$/g, "");
  return trimmed === token || trimmed === linkedDomainDnsTxtValue(token);
}

export function htmlBodyMatchesToken(body: string, token: string): boolean {
  return body.trim() === token;
}

export function htmlContainsVerificationMeta(html: string, token: string): boolean {
  const pattern = new RegExp(
    `<meta\\s+[^>]*name=["']${LINKED_DOMAIN_META_NAME}["'][^>]*content=["']${escapeRegExp(token)}["'][^>]*/?>`,
    "i",
  );
  const altPattern = new RegExp(
    `<meta\\s+[^>]*content=["']${escapeRegExp(token)}["'][^>]*name=["']${LINKED_DOMAIN_META_NAME}["'][^>]*/?>`,
    "i",
  );
  return pattern.test(html) || altPattern.test(html);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
