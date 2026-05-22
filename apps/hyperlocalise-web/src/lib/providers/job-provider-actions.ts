import type { AgentRunKind } from "@/lib/database/types";

import {
  getTmsProviderActionCapability,
  type TmsProviderCapabilityAction,
} from "./tms-capabilities";

export type JobProviderActionId =
  | "translate_with_agent"
  | "review_with_agent"
  | "fix_qa_issues"
  | "leave_provider_comment"
  | "push_approved_changes";

export type JobProviderActionDefinition = {
  id: JobProviderActionId;
  label: string;
  agentRunKind: AgentRunKind;
  requiredCapabilities: TmsProviderCapabilityAction[];
  inputSnapshot?: Record<string, unknown>;
};

export const jobProviderActionDefinitions: JobProviderActionDefinition[] = [
  {
    id: "translate_with_agent",
    label: "Translate with agent",
    agentRunKind: "translate",
    requiredCapabilities: ["jobs.read", "keys.read", "write_back.translation"],
  },
  {
    id: "review_with_agent",
    label: "Review with agent",
    agentRunKind: "review",
    requiredCapabilities: ["jobs.read", "comments.read"],
  },
  {
    id: "fix_qa_issues",
    label: "Fix QA issues",
    agentRunKind: "qa_fix",
    requiredCapabilities: ["qa.run", "write_back.translation"],
  },
  {
    id: "leave_provider_comment",
    label: "Leave provider comment",
    agentRunKind: "comment_only",
    requiredCapabilities: ["comments.write"],
  },
  {
    id: "push_approved_changes",
    label: "Push approved changes",
    agentRunKind: "translate",
    requiredCapabilities: ["write_back.translation", "status_transitions.write"],
    inputSnapshot: { action: "push_approved" },
  },
];

export type JobProviderActionAvailability = {
  id: JobProviderActionId;
  label: string;
  agentRunKind: AgentRunKind;
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
};

function resolveActionAvailability(
  providerKind: string,
  action: JobProviderActionDefinition,
): JobProviderActionAvailability {
  const capabilityResults = action.requiredCapabilities.map((capability) =>
    getTmsProviderActionCapability(providerKind, capability),
  );

  const unsupported = capabilityResults.find((capability) => !capability.supported);
  if (unsupported) {
    if (unsupported.ui.state === "hidden") {
      return {
        id: action.id,
        label: action.label,
        agentRunKind: action.agentRunKind,
        visible: false,
        enabled: false,
      };
    }

    return {
      id: action.id,
      label: action.label,
      agentRunKind: action.agentRunKind,
      visible: true,
      enabled: false,
      disabledReason: unsupported.ui.disabledReason,
    };
  }

  const disabled = capabilityResults.find((capability) => capability.ui.state === "disabled");
  if (disabled) {
    return {
      id: action.id,
      label: action.label,
      agentRunKind: action.agentRunKind,
      visible: true,
      enabled: false,
      disabledReason: disabled.ui.disabledReason,
    };
  }

  return {
    id: action.id,
    label: action.label,
    agentRunKind: action.agentRunKind,
    visible: true,
    enabled: true,
  };
}

export function getJobProviderActionAvailability(providerKind: string) {
  return jobProviderActionDefinitions.map((action) =>
    resolveActionAvailability(providerKind, action),
  );
}

export function getJobProviderActionDefinition(actionId: JobProviderActionId) {
  return jobProviderActionDefinitions.find((action) => action.id === actionId) ?? null;
}

export function isJobProviderActionAvailable(providerKind: string, actionId: JobProviderActionId) {
  const availability = getJobProviderActionAvailability(providerKind).find(
    (action) => action.id === actionId,
  );

  return availability?.enabled ?? false;
}
