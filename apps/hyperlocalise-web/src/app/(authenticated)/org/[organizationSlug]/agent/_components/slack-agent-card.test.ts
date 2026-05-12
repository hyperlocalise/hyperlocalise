import { describe, expect, it } from "vite-plus/test";

import { getSlackAgentViewModel, type SlackAgentState } from "./slack-agent-card";

function createSlackAgent(overrides: Partial<SlackAgentState> = {}): SlackAgentState {
  return {
    enabled: true,
    teamId: "T123",
    teamName: "Launch Team",
    ...overrides,
  };
}

describe("getSlackAgentViewModel", () => {
  it("shows a connected and enabled Slack workspace", () => {
    const viewModel = getSlackAgentViewModel(createSlackAgent());

    expect(viewModel).toEqual({
      connected: true,
      enabled: true,
      badgeLabel: "Connected",
      statusTitle: "Enabled",
      statusDescription: "Installed on Launch Team",
      primaryActionLabel: "Reconnect Slack",
      toggleDisabled: false,
    });
  });

  it("keeps connected workspaces manageable when disabled", () => {
    const viewModel = getSlackAgentViewModel(createSlackAgent({ enabled: false }));

    expect(viewModel.connected).toBe(true);
    expect(viewModel.enabled).toBe(false);
    expect(viewModel.statusTitle).toBe("Disabled");
    expect(viewModel.primaryActionLabel).toBe("Reconnect Slack");
    expect(viewModel.toggleDisabled).toBe(false);
  });

  it("requires OAuth connection before enabling Slack", () => {
    const viewModel = getSlackAgentViewModel({
      enabled: true,
      teamId: null,
      teamName: null,
    });

    expect(viewModel.connected).toBe(false);
    expect(viewModel.enabled).toBe(false);
    expect(viewModel.badgeLabel).toBe("Available");
    expect(viewModel.statusTitle).toBe("Not connected");
    expect(viewModel.primaryActionLabel).toBe("Connect Slack");
    expect(viewModel.toggleDisabled).toBe(true);
  });
});
