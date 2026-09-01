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

const SLACK_CHANNEL_NAME_MAX_LENGTH = 80;
const DEFAULT_CHANNEL_PREFIX = "ext";
const ORGANIZATION_ID_PURPOSE_PREFIX = "hyperlocalise-org:";
const CHANNEL_NAME_ID_SUFFIX_LENGTH = 8;

export function slackConnectChannelPurpose(organizationId: string) {
  return `${ORGANIZATION_ID_PURPOSE_PREFIX}${organizationId}`;
}

export function slackConnectOrganizationIdFromPurpose(purpose: string | null | undefined) {
  const trimmed = purpose?.trim() ?? "";
  if (!trimmed.startsWith(ORGANIZATION_ID_PURPOSE_PREFIX)) {
    return null;
  }

  const organizationId = trimmed.slice(ORGANIZATION_ID_PURPOSE_PREFIX.length);
  return organizationId.length > 0 ? organizationId : null;
}

export function slackConnectChannelName(
  organizationSlug: string,
  organizationId: string,
  prefix = DEFAULT_CHANNEL_PREFIX,
): string {
  const safePrefix = sanitizeSlackChannelFragment(prefix) || DEFAULT_CHANNEL_PREFIX;
  const unique = organizationIdFragment(organizationId, CHANNEL_NAME_ID_SUFFIX_LENGTH);
  const reserved = safePrefix.length + unique.length + 2;
  const maxSlugLength = Math.max(1, SLACK_CHANNEL_NAME_MAX_LENGTH - reserved);
  const safeSlug = (sanitizeSlackChannelFragment(organizationSlug) || "workspace").slice(
    0,
    maxSlugLength,
  );

  return `${safePrefix}-${safeSlug}-${unique}`;
}

export function slackConnectUniqueChannelName(
  organizationId: string,
  prefix = DEFAULT_CHANNEL_PREFIX,
): string {
  const safePrefix = sanitizeSlackChannelFragment(prefix) || DEFAULT_CHANNEL_PREFIX;
  return `${safePrefix}-${organizationIdFragment(organizationId)}`;
}

export function maskEmailForDisplay(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) {
    return "***";
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

function organizationIdFragment(organizationId: string, length?: number) {
  const hex = organizationId.replace(/-/gu, "").toLowerCase();
  if (length === undefined) {
    return hex;
  }

  return hex.slice(0, length);
}

function sanitizeSlackChannelFragment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}
