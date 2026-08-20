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
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";

function auditHost(value: string): string {
  return value
    .replace(/\.$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

function hostBelongsToAuditDomain(hostname: string, domainKey: string): boolean {
  const host = auditHost(hostname);
  const allowed = auditHost(domainKey);
  if (!host || !allowed) return false;
  return host === allowed || host.endsWith(`.${allowed}`);
}

/**
 * Finding URLs come from crawled pages and model output. Only http(s) links on
 * the audited host (or a subdomain) may become hrefs in trusted UI.
 */
export function sanitizeLocalisationAuditFindingUrl(
  value: string | null | undefined,
  domainKey: string,
): string | null {
  const sanitized = sanitizeExternalUrl(value);
  if (!sanitized) return null;

  try {
    const parsed = new URL(sanitized);
    if (!hostBelongsToAuditDomain(parsed.hostname, domainKey)) {
      return null;
    }
    return sanitized;
  } catch {
    return null;
  }
}
