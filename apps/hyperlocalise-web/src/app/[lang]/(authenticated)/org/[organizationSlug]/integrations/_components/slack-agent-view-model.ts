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
