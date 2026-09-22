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
import type { CanonicalVisualWorkflowNode, VisualNodeConfig } from "./schema/types";

type VisualWorkflowDefinitionWithNodes = {
  nodes: CanonicalVisualWorkflowNode[];
};

type NotifyEmailNodeConfig = Extract<VisualNodeConfig, { kind: "action.notify_email" }>;

function emailNodeConfigFingerprint(config: NotifyEmailNodeConfig): string {
  const { workosUserId: _workosUserId, ...rest } = config;
  return JSON.stringify(rest);
}

function previousEmailNodeConfigById(
  previousDefinition: VisualWorkflowDefinitionWithNodes | null | undefined,
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

function withEmailWorkosUserId(
  node: CanonicalVisualWorkflowNode,
  workosUserId: string | undefined,
): CanonicalVisualWorkflowNode {
  if (node.config.kind !== "action.notify_email") {
    return node;
  }

  if (!workosUserId) {
    if (!node.config.workosUserId) {
      return node;
    }
    const { workosUserId: _removed, ...rest } = node.config;
    return {
      ...node,
      config: rest,
    };
  }

  if (node.config.workosUserId === workosUserId) {
    return node;
  }

  return {
    ...node,
    config: {
      ...node.config,
      workosUserId,
    },
  };
}

export function stampEmailNodePipesUsersOnDefinition<
  TDefinition extends VisualWorkflowDefinitionWithNodes,
>(input: {
  definition: TDefinition;
  previousDefinition?: VisualWorkflowDefinitionWithNodes | null;
  actorWorkosUserId?: string | null;
}): TDefinition {
  const actorWorkosUserId = input.actorWorkosUserId?.trim() || null;
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
      // Unrelated save: keep the stored credential owner. Never prefer a
      // client-supplied workosUserId — that would be a same-org credential IDOR.
      const preservedWorkosUserId = previousConfig.workosUserId ?? actorWorkosUserId ?? undefined;
      return withEmailWorkosUserId(node, preservedWorkosUserId);
    }

    if (!actorWorkosUserId) {
      // New/changed email node without an authenticated actor must not accept
      // a client-chosen credential owner.
      return withEmailWorkosUserId(node, undefined);
    }

    return withEmailWorkosUserId(node, actorWorkosUserId);
  });

  return {
    ...input.definition,
    nodes,
  };
}
