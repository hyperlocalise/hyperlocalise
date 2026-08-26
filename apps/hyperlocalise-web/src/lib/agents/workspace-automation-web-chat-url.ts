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

export function buildWorkspaceAutomationWebChatPath(input: {
  organizationSlug: string;
  automationId: string;
}) {
  return `/chat/${encodeURIComponent(input.organizationSlug)}/${encodeURIComponent(input.automationId)}`;
}

export function buildWorkspaceAutomationWebChatHref(input: {
  organizationSlug: string;
  automationId: string;
  locale: string;
}) {
  return `/${input.locale}${buildWorkspaceAutomationWebChatPath(input)}`;
}

export function buildWorkspaceAutomationWebChatUrl(input: {
  organizationSlug: string;
  automationId: string;
  locale: string;
  origin: string;
}) {
  return new URL(buildWorkspaceAutomationWebChatHref(input), input.origin).toString();
}
