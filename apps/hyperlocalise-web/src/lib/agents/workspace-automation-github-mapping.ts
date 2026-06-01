import {
  branchMatchesAutomationPatterns,
  type GithubRepositoryAutomationSettings,
} from "@/lib/agents/github/github-repository-automation-settings";

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationToolConfig,
  WorkspaceAutomationTriggerConfig,
} from "./workspace-automations";

export function hasWorkspaceAutomationGithubWorkflow(
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  const github = toolConfig.github;
  if (!github?.enabled) {
    return false;
  }

  return Boolean(github.pushSource || github.pullTranslations || github.validation);
}

export function workspaceAutomationToGithubSettings(
  automation: WorkspaceAutomationRecord,
): GithubRepositoryAutomationSettings | null {
  const github = automation.toolConfig.github;
  if (!hasWorkspaceAutomationGithubWorkflow(automation.toolConfig) || !github?.projectId) {
    return null;
  }

  const trigger = resolveGithubTriggerFromWorkspaceTrigger(automation.triggerConfig);
  if (!trigger) {
    return null;
  }

  return {
    workflows: {
      pushSource: {
        enabled: github.pushSource,
        projectId: github.projectId,
      },
      pullTranslations: {
        enabled: github.pullTranslations,
        projectId: github.projectId,
      },
      validation: {
        enabled: github.validation,
        blockOnFailure: true,
      },
    },
    trigger,
    statusCheck: {
      enabled: false,
      mode: "blocking",
    },
  };
}

function resolveGithubTriggerFromWorkspaceTrigger(
  triggerConfig: WorkspaceAutomationTriggerConfig,
): GithubRepositoryAutomationSettings["trigger"] {
  if (triggerConfig.mode === "scheduled" && triggerConfig.schedule) {
    return {
      mode: "scheduled",
      cadence: triggerConfig.schedule.cadence,
      hourUtc: triggerConfig.schedule.hourUtc ?? 0,
      dayOfWeek: triggerConfig.schedule.dayOfWeek,
      timezone: triggerConfig.schedule.timezone,
    };
  }

  if (
    triggerConfig.mode === "github" &&
    triggerConfig.branches &&
    triggerConfig.branches.length > 0
  ) {
    return {
      mode: "push",
      branches: triggerConfig.branches,
    };
  }

  return null;
}

export function workspaceAutomationMatchesPushBranch(
  automation: WorkspaceAutomationRecord,
  branch: string,
): boolean {
  if (automation.triggerConfig.mode !== "github") {
    return false;
  }

  const branches = automation.triggerConfig.branches ?? [];
  return branchMatchesAutomationPatterns(branch, branches);
}
