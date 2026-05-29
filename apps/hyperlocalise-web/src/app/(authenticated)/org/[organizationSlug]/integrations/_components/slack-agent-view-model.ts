export type SlackAgentState = {
  enabled: boolean;
  teamId: string | null;
  teamName: string | null;
};

export function getSlackAgentViewModel(slackAgent: SlackAgentState | undefined) {
  const connected = Boolean(slackAgent?.teamId);
  const enabled = connected && Boolean(slackAgent?.enabled);

  return {
    connected,
    enabled,
    badgeLabel: connected ? "Connected" : "Available",
    statusTitle: connected ? (enabled ? "Enabled" : "Disabled") : "Not connected",
    statusDescription: connected
      ? `Installed on ${slackAgent?.teamName ?? slackAgent?.teamId ?? "Slack workspace"}`
      : "Connect a Slack workspace to let Hyperlocalise respond to mentions, DMs, and subscribed threads.",
    primaryActionLabel: connected ? "Reconnect Slack" : "Connect Slack",
    toggleDisabled: !connected,
  };
}
