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
import { z } from "zod";

import { visualWorkflowV3DefinitionSchema } from "./definition-schema";
import type { VisualWorkflowV3Definition } from "./types";
import { computeForEachBodyNodeIdsFromV3Edges } from "../editor/for-each-body-membership";

const visualWorkflowV2EdgeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    source: z.string().trim().min(1).max(128),
    target: z.string().trim().min(1).max(128),
    sourceHandle: z.string().max(64).nullable(),
    targetHandle: z.string().max(64).nullable(),
  })
  .strict();

const visualWorkflowV2DefinitionSchema = z
  .object({
    schemaVersion: z.literal(2),
    name: z.string().trim().min(1).max(120),
    nodes: z.array(z.unknown()).max(200),
    edges: z.array(visualWorkflowV2EdgeSchema).max(400),
    editor: z.unknown(),
  })
  .passthrough();

function withGraphDerivedForEachMembership(
  definition: VisualWorkflowV3Definition,
): VisualWorkflowV3Definition {
  return {
    ...definition,
    nodes: definition.nodes.map((node) =>
      node.type === "logic.for_each"
        ? {
            ...node,
            bodyNodeIds: computeForEachBodyNodeIdsFromV3Edges(node.id, definition.edges),
          }
        : node,
    ),
  };
}

export function parseVisualWorkflowV3Definition(value: unknown): VisualWorkflowV3Definition {
  const current = visualWorkflowV3DefinitionSchema.safeParse(value);

  if (current.success) {
    return withGraphDerivedForEachMembership(current.data);
  }

  const legacy = visualWorkflowV2DefinitionSchema.parse(value);

  const migrated = visualWorkflowV3DefinitionSchema.parse({
    ...legacy,
    schemaVersion: 3,
    edges: legacy.edges.map(({ sourceHandle, targetHandle, ...edge }) => ({
      ...edge,
      kind: "execution" as const,
      sourcePortId: sourceHandle ?? "success",
      targetPortId: targetHandle ?? "input",
    })),
  });

  return withGraphDerivedForEachMembership(migrated);
}
