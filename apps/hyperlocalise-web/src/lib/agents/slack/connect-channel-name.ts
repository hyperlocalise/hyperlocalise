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

export function slackConnectChannelName(
  organizationSlug: string,
  prefix = DEFAULT_CHANNEL_PREFIX,
): string {
  const safePrefix = sanitizeSlackChannelFragment(prefix) || DEFAULT_CHANNEL_PREFIX;
  const safeSlug = sanitizeSlackChannelFragment(organizationSlug) || "workspace";
  const name = `${safePrefix}-${safeSlug}`;
  if (name.length <= SLACK_CHANNEL_NAME_MAX_LENGTH) {
    return name;
  }

  return name.slice(0, SLACK_CHANNEL_NAME_MAX_LENGTH).replace(/-+$/u, "");
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

function sanitizeSlackChannelFragment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}
