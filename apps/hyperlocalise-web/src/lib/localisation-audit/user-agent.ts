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
/**
 * Desktop Chrome identity for HTTP fetches and the sandbox Chromium fallback.
 * Tilion sessions keep their stealth persona instead of this string.
 */
export const LOCALISATION_AUDIT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const LOCALISATION_AUDIT_CRAWL_BLOCKED_MESSAGE =
  "This domain blocked the audit browser. Allow ordinary browser traffic to public pages through your firewall, CDN, bot protection, or login wall, then start a new audit.";

export const LOCALISATION_AUDIT_RECLAIM_BLOCKED_MESSAGE =
  "This domain blocked the audit browser, so the last run could not score it. Allow ordinary browser traffic to public pages through your firewall, CDN, bot protection, or login wall, then start a new audit.";

export const LOCALISATION_AUDIT_EMAIL_BLOCKED_MESSAGE =
  "This audit was blocked by the domain. Allow ordinary browser traffic to public pages, then start a new audit before requesting a report email.";

export const LOCALISATION_AUDIT_ENGINE_SETUP_BLOCKED_MESSAGE =
  "This site blocked the audit browser. Allow ordinary browser traffic through your firewall, CDN or bot protection, then try again.";

export const LOCALISATION_AUDIT_DEEP_AUDIT_BLOCKED_MESSAGE =
  "This domain blocked the audit browser. Allow ordinary browser traffic to public pages through your firewall, CDN, bot protection, or login wall, then run the audit again.";
