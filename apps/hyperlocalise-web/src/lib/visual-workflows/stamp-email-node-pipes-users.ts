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

/** Steps that send through the connection of the person who last saved them. */
const CREDENTIAL_OWNER_KINDS = new Set<VisualNodeConfig["kind"]>([
  "action.notify_email",
  "action.crowdin_pre_translate",
  "action.crowdin_create_task",
  "action.crowdin_check_progress",
]);

type CredentialOwnerNodeConfig = Extract<
  VisualNodeConfig,
  {
    kind:
      | "action.notify_email"
      | "action.crowdin_pre_translate"
      | "action.crowdin_create_task"
      | "action.crowdin_check_progress";
  }
>;

function hasCredentialOwner(config: VisualNodeConfig): config is CredentialOwnerNodeConfig {
  return CREDENTIAL_OWNER_KINDS.has(config.kind);
}

function credentialOwnerConfigFingerprint(config: CredentialOwnerNodeConfig): string {
  const { workosUserId: _workosUserId, ...rest } = config;
  return JSON.stringify(rest);
}

function previousCredentialOwnerConfigById(
  previousDefinition: VisualWorkflowDefinitionWithNodes | null | undefined,
): Map<string, CredentialOwnerNodeConfig> {
  const configs = new Map<string, CredentialOwnerNodeConfig>();
  if (!previousDefinition) {
    return configs;
  }

  for (const node of previousDefinition.nodes) {
    if (hasCredentialOwner(node.config)) {
      configs.set(node.id, node.config);
    }
  }

  return configs;
}

function withWorkosUserId(
  node: CanonicalVisualWorkflowNode,
  workosUserId: string | undefined,
): CanonicalVisualWorkflowNode {
  if (!hasCredentialOwner(node.config)) {
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
  const previousConfigs = previousCredentialOwnerConfigById(input.previousDefinition);

  const nodes = input.definition.nodes.map((node) => {
    if (!hasCredentialOwner(node.config)) {
      return node;
    }

    const previousConfig = previousConfigs.get(node.id);
    const configChanged =
      !previousConfig ||
      previousConfig.kind !== node.config.kind ||
      credentialOwnerConfigFingerprint(previousConfig) !==
        credentialOwnerConfigFingerprint(node.config);

    if (!configChanged) {
      // Unrelated save: keep the stored credential owner. Never prefer a
      // client-supplied workosUserId — that would be a same-org credential IDOR.
      const preservedWorkosUserId = previousConfig.workosUserId ?? actorWorkosUserId ?? undefined;
      return withWorkosUserId(node, preservedWorkosUserId);
    }

    if (!actorWorkosUserId) {
      // New/changed node without an authenticated actor must not accept
      // a client-chosen credential owner.
      return withWorkosUserId(node, undefined);
    }

    return withWorkosUserId(node, actorWorkosUserId);
  });

  return {
    ...input.definition,
    nodes,
  };
}
