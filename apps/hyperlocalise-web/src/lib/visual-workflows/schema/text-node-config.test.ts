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
import { describe, expect, it } from "vite-plus/test";

import { createDefaultConfig } from "../catalog/node-catalog";
import { getWorkflowInputFields, NODE_CONTRACTS } from "../catalog/node-contracts";
import { VISUAL_NODE_DESCRIPTIONS } from "../catalog/node-descriptions";
import { getVisualWorkflowDataPorts } from "../editor/visual-workflow-data-ports";
import { applyNodeConfigUpdate } from "../editor/visual-workflow-editor-graph";
import { compileVisualWorkflowV3Definition } from "../validation/compile-workflow-v3";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";
import type {
  CanonicalVisualWorkflowNode,
  VisualNodeConfig,
  VisualWorkflowRfEdge,
  VisualWorkflowRfNode,
  VisualWorkflowV3Definition,
} from "./types";
import { visualNodeConfigSchema } from "./definition-schema";
import { parseTextTemplate } from "./text-template";

const placeholderId = "8ef8d9f8-e677-4f10-bfd4-462836856679";
const optionalId = "80dc47d6-5b2f-44a4-83e5-cc89c66b20f6";

function node(config: VisualNodeConfig): CanonicalVisualWorkflowNode {
  return { id: "text-node", type: config.kind, config };
}

function rfNode(config: VisualNodeConfig): VisualWorkflowRfNode {
  return {
    id: "text-node",
    type: config.kind,
    position: { x: 80, y: 160 },
    data: { catalogType: config.kind, config, runStatus: "idle" },
  };
}

describe("Text node configuration", () => {
  it("provides valid defaults with stable dynamic input ids", () => {
    const template = createDefaultConfig("logic.text_template");
    const concatenate = createDefaultConfig("logic.concatenate");

    expect(visualNodeConfigSchema.safeParse(template).success).toBe(true);
    expect(visualNodeConfigSchema.safeParse(concatenate).success).toBe(true);
    if (template.kind !== "logic.text_template") return;
    if (concatenate.kind !== "logic.concatenate") return;
    expect(template.placeholders[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(concatenate.segments.every((segment) => /^[0-9a-f-]{36}$/.test(segment.id))).toBe(true);
  });

  it("validates required, optional, and fallback placeholder behavior", () => {
    const base = {
      kind: "logic.text_template" as const,
      template: "{{name}} {{company}}",
      placeholders: [
        {
          id: placeholderId,
          name: "name",
          type: "string" as const,
          missingBehavior: "required" as const,
        },
        {
          id: optionalId,
          name: "company",
          type: "string" as const,
          missingBehavior: "fallback" as const,
          fallback: "Hyperlocalise",
        },
      ],
    };

    expect(visualNodeConfigSchema.safeParse(base).success).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        placeholders: [
          { ...base.placeholders[0], missingBehavior: "fallback", fallback: undefined },
        ],
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        placeholders: [base.placeholders[0], { ...base.placeholders[0] }],
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({ ...base, template: "Hello {{unknown}}" }).success,
    ).toBe(false);
    expect(visualNodeConfigSchema.safeParse({ ...base, template: "Hello {{name" }).success).toBe(
      false,
    );
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        placeholders: [{ ...base.placeholders[0]!, name: "customer name" }],
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        ...base,
        template: "{{name}}",
      }).success,
    ).toBe(false);
    expect(parseTextTemplate(String.raw`Literal \{{name}} and {{company}}`)).toEqual({
      valid: true,
      placeholderNames: ["company"],
      tokens: [
        { kind: "literal", value: "Literal " },
        { kind: "literal", value: "{{" },
        { kind: "literal", value: "name}} and " },
        { kind: "placeholder", name: "company" },
      ],
    });
  });

  it("validates ordered literal and typed input segments", () => {
    const config = {
      kind: "logic.concatenate" as const,
      separator: " ",
      segments: [
        { id: placeholderId, kind: "literal" as const, value: "Hello" },
        {
          id: optionalId,
          kind: "input" as const,
          name: "Count",
          type: "number" as const,
          missingBehavior: "optional" as const,
        },
      ],
    };

    expect(visualNodeConfigSchema.safeParse(config).success).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        ...config,
        segments: [...config.segments, { ...config.segments[0] }],
      }).success,
    ).toBe(false);
    expect(
      visualNodeConfigSchema.safeParse({
        ...config,
        segments: [
          config.segments[1]!,
          { ...config.segments[1]!, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        ],
      }).success,
    ).toBe(false);
  });

  it("declares stable typed ports derived from ids rather than labels or order", () => {
    const template = node({
      kind: "logic.text_template",
      template: "{{name}} {{count}}",
      placeholders: [
        {
          id: placeholderId,
          name: "name",
          type: "string",
          missingBehavior: "required",
        },
        {
          id: optionalId,
          name: "count",
          type: "number",
          missingBehavior: "fallback",
          fallback: "0",
        },
      ],
    });
    const concatenate = node({
      kind: "logic.concatenate",
      separator: " ",
      segments: [
        { id: placeholderId, kind: "literal", value: "Count:" },
        {
          id: optionalId,
          kind: "input",
          name: "Renamed count",
          type: "number",
          missingBehavior: "optional",
        },
      ],
    });

    expect(getWorkflowInputFields(template)).toEqual([
      { name: `value.${placeholderId}`, type: "string", required: true },
      { name: `value.${optionalId}`, type: "number", required: false },
    ]);
    expect(getWorkflowInputFields(concatenate)).toEqual([
      { name: `value.${optionalId}`, type: "number", required: false },
    ]);
    expect(NODE_CONTRACTS["logic.text_template"].outputs).toEqual([
      { path: "text", type: "string", optional: false },
    ]);
    expect(NODE_CONTRACTS["logic.concatenate"].outputs).toEqual([
      { path: "text", type: "string", optional: false },
    ]);
  });

  it("registers user-facing catalog descriptions", () => {
    expect(VISUAL_NODE_DESCRIPTIONS["logic.text_template"].title).toBe("Text template");
    expect(VISUAL_NODE_DESCRIPTIONS["logic.concatenate"].title).toBe("Concatenate text");
  });

  it("round-trips stable ids, bindings, and data edges", () => {
    const definition: VisualWorkflowV3Definition = {
      schemaVersion: 3,
      name: "Text round trip",
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual",
          config: { kind: "trigger.manual" },
        },
        {
          id: "template",
          type: "logic.text_template",
          config: {
            kind: "logic.text_template",
            template: "Hello, {{name}}!",
            placeholders: [
              {
                id: placeholderId,
                name: "name",
                type: "string",
                missingBehavior: "required",
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: "trigger-template",
          kind: "execution",
          source: "trigger",
          target: "template",
          sourcePortId: "success",
          targetPortId: "input",
        },
        {
          id: "trigger-name",
          kind: "data",
          source: "trigger",
          target: "template",
          sourcePortId: "triggeredAt",
          targetPortId: `value.${placeholderId}`,
        },
      ],
      editor: {
        positions: {
          trigger: { x: 0, y: 0 },
          template: { x: 240, y: 0 },
        },
      },
    };

    const roundTripped = toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(definition));
    expect(roundTripped.nodes.find((entry) => entry.id === "template")?.config).toEqual(
      definition.nodes[1]?.config,
    );
    expect(roundTripped.edges).toEqual(definition.edges);
  });

  it("binds stable text ports and reports missing or incompatible values", () => {
    const definition: VisualWorkflowV3Definition = {
      schemaVersion: 3,
      name: "Compile text",
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual",
          config: { kind: "trigger.manual" },
        },
        {
          id: "template",
          type: "logic.text_template",
          config: {
            kind: "logic.text_template",
            template: "{{name}} {{count}}",
            placeholders: [
              {
                id: placeholderId,
                name: "name",
                type: "string",
                missingBehavior: "required",
              },
              {
                id: optionalId,
                name: "count",
                type: "number",
                missingBehavior: "required",
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: "trigger-template",
          kind: "execution",
          source: "trigger",
          target: "template",
          sourcePortId: "success",
          targetPortId: "input",
        },
        {
          id: "trigger-name",
          kind: "data",
          source: "trigger",
          target: "template",
          sourcePortId: "triggeredAt",
          targetPortId: `value.${placeholderId}`,
        },
      ],
      editor: { positions: {} },
    };

    const compiled = compileVisualWorkflowV3Definition(definition);
    expect(compiled.definition.nodes[1]?.inputs?.[`value.${placeholderId}`]).toEqual({
      kind: "reference",
      nodeId: "trigger",
      path: ["triggeredAt"],
    });
    expect(compiled.issues).toContainEqual({
      code: "missing_required_input",
      nodeId: "template",
      field: `value.${optionalId}`,
      reason: "required",
    });

    const incompatible = compileVisualWorkflowV3Definition({
      ...definition,
      edges: definition.edges.map((edge) =>
        edge.id === "trigger-name" ? { ...edge, targetPortId: `value.${optionalId}` } : edge,
      ),
    });
    expect(incompatible.issues).toContainEqual({
      code: "incompatible_data_types",
      edgeId: "trigger-name",
      nodeId: "template",
    });
  });

  it("compiles optional and fallback text ports as optional references", () => {
    const definition: VisualWorkflowV3Definition = {
      schemaVersion: 3,
      name: "Optional text",
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual",
          config: { kind: "trigger.manual" },
        },
        {
          id: "template",
          type: "logic.text_template",
          config: {
            kind: "logic.text_template",
            template: "{{name}} {{count}}",
            placeholders: [
              {
                id: placeholderId,
                name: "name",
                type: "string",
                missingBehavior: "optional",
              },
              {
                id: optionalId,
                name: "count",
                type: "string",
                missingBehavior: "fallback",
                fallback: "0",
              },
            ],
          },
        },
      ],
      edges: [
        {
          id: "trigger-template",
          kind: "execution",
          source: "trigger",
          target: "template",
          sourcePortId: "success",
          targetPortId: "input",
        },
        {
          id: "trigger-name",
          kind: "data",
          source: "trigger",
          target: "template",
          sourcePortId: "triggeredAt",
          targetPortId: `value.${placeholderId}`,
        },
        {
          id: "trigger-count",
          kind: "data",
          source: "trigger",
          target: "template",
          sourcePortId: "triggeredAt",
          targetPortId: `value.${optionalId}`,
        },
      ],
      editor: { positions: {} },
    };

    const compiled = compileVisualWorkflowV3Definition(definition);
    expect(compiled.issues).toEqual([]);
    expect(compiled.definition.nodes[1]?.inputs).toEqual({
      [`value.${placeholderId}`]: {
        kind: "reference",
        nodeId: "trigger",
        path: ["triggeredAt"],
        optional: true,
      },
      [`value.${optionalId}`]: {
        kind: "reference",
        nodeId: "trigger",
        path: ["triggeredAt"],
        optional: true,
      },
    });
  });

  it("exposes labels while retaining ids across rename and reorder", () => {
    const config: VisualNodeConfig = {
      kind: "logic.text_template",
      template: "{{name}} {{count}}",
      placeholders: [
        {
          id: placeholderId,
          name: "Name",
          type: "string",
          missingBehavior: "required",
        },
        {
          id: optionalId,
          name: "Count",
          type: "number",
          missingBehavior: "optional",
        },
      ],
    };
    const edge: VisualWorkflowRfEdge = {
      id: "name-edge",
      source: "source",
      target: "text-node",
      sourceHandle: "text",
      targetHandle: `value.${placeholderId}`,
      data: { kind: "data" },
    };
    const ports = getVisualWorkflowDataPorts({ node: rfNode(config), edges: [edge] });
    expect(ports.inputs.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: `value.${placeholderId}`, label: "Name" },
      { id: `value.${optionalId}`, label: "Count" },
    ]);

    if (config.kind !== "logic.text_template") return;
    const updated = applyNodeConfigUpdate([rfNode(config)], [edge], "text-node", {
      ...config,
      placeholders: [
        { ...config.placeholders[1]!, name: "Total" },
        { ...config.placeholders[0]!, name: "Customer" },
      ],
    });
    expect(updated.edges).toEqual([edge]);

    const removed = applyNodeConfigUpdate(updated.nodes, updated.edges, "text-node", {
      ...config,
      placeholders: [config.placeholders[1]!],
    });
    expect(removed.edges).toEqual([]);
  });
});
