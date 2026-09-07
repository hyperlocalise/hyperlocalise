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
import type { VisualNodeConfig, VisualWorkflowDefinition } from "./schema/types";

type NotifyEmailNodeConfig = Extract<VisualNodeConfig, { kind: "action.notify_email" }>;

function emailNodeConfigFingerprint(config: NotifyEmailNodeConfig): string {
  const { workosUserId: _workosUserId, ...rest } = config;
  return JSON.stringify(rest);
}

function previousEmailNodeConfigById(
  previousDefinition: VisualWorkflowDefinition | null | undefined,
): Map<string, NotifyEmailNodeConfig> {
  const configs = new Map<string, NotifyEmailNodeConfig>();
  if (!previousDefinition) {
    return configs;
  }

  for (const node of previousDefinition.nodes) {
    if (node.config.kind === "action.notify_email") {
      configs.set(node.id, node.config);
    }
  }

  return configs;
}

export function stampEmailNodePipesUsersOnDefinition(input: {
  definition: VisualWorkflowDefinition;
  previousDefinition?: VisualWorkflowDefinition | null;
  actorWorkosUserId?: string | null;
}): VisualWorkflowDefinition {
  const actorWorkosUserId = input.actorWorkosUserId?.trim();
  if (!actorWorkosUserId) {
    return input.definition;
  }

  const previousConfigs = previousEmailNodeConfigById(input.previousDefinition);

  const nodes = input.definition.nodes.map((node) => {
    if (node.config.kind !== "action.notify_email") {
      return node;
    }

    const previousConfig = previousConfigs.get(node.id);
    const configChanged =
      !previousConfig ||
      emailNodeConfigFingerprint(previousConfig) !== emailNodeConfigFingerprint(node.config);

    if (!configChanged) {
      const preservedWorkosUserId = node.config.workosUserId ?? previousConfig?.workosUserId;
      if (!preservedWorkosUserId || preservedWorkosUserId === node.config.workosUserId) {
        return node;
      }

      return {
        ...node,
        config: {
          ...node.config,
          workosUserId: preservedWorkosUserId,
        },
      };
    }

    return {
      ...node,
      config: {
        ...node.config,
        workosUserId: actorWorkosUserId,
      },
    };
  });

  return {
    ...input.definition,
    nodes,
  };
}
