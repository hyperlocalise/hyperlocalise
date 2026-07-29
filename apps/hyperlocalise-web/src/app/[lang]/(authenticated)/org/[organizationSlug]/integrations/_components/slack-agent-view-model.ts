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
import type { IntlShape } from "react-intl";

import { slackAgentViewModelMessages } from "./slack-agent-view-model.messages";

export type SlackAgentState = {
  enabled: boolean;
  teamId: string | null;
  teamName: string | null;
};

export function getSlackAgentViewModel(slackAgent: SlackAgentState | undefined, intl: IntlShape) {
  const connected = Boolean(slackAgent?.teamId);
  const enabled = connected && Boolean(slackAgent?.enabled);
  const workspace =
    slackAgent?.teamName ??
    slackAgent?.teamId ??
    intl.formatMessage(slackAgentViewModelMessages.slackWorkspaceFallback);

  return {
    connected,
    enabled,
    badgeLabel: connected
      ? intl.formatMessage(slackAgentViewModelMessages.connectedBadge)
      : intl.formatMessage(slackAgentViewModelMessages.availableBadge),
    statusTitle: connected
      ? enabled
        ? intl.formatMessage(slackAgentViewModelMessages.enabledStatus)
        : intl.formatMessage(slackAgentViewModelMessages.disabledStatus)
      : intl.formatMessage(slackAgentViewModelMessages.notConnectedStatus),
    statusDescription: connected
      ? intl.formatMessage(slackAgentViewModelMessages.statusDescriptionConnected, { workspace })
      : intl.formatMessage(slackAgentViewModelMessages.statusDescriptionNotConnected),
    primaryActionLabel: connected
      ? intl.formatMessage(slackAgentViewModelMessages.reconnectSlack)
      : intl.formatMessage(slackAgentViewModelMessages.connectSlack),
    toggleDisabled: !connected,
  };
}
