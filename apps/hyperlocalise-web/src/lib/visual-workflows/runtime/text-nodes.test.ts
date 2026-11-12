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

import type { CanonicalVisualWorkflowNode } from "../schema/types";
import { resolveWorkflowNodeInputs } from "./bindings";
import type { VisualWorkflowExecutionContext } from "./context";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";
import { executeConcatenate, executeTextTemplate, TEXT_NODE_LIMITS } from "./text-nodes";
import { runPlaygroundWorkflow } from "../preview/playground-run";
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";

const nameId = "8ef8d9f8-e677-4f10-bfd4-462836856679";
const countId = "80dc47d6-5b2f-44a4-83e5-cc89c66b20f6";

const context: VisualWorkflowExecutionContext = {
  trigger: {},
  nodes: { source: { name: "Ada", count: 3 } },
};

describe("Text Template workflow node", () => {
  const placeholders = [
    { id: nameId, name: "name", type: "string" as const, missingBehavior: "required" as const },
    {
      id: countId,
      name: "count",
      type: "number" as const,
      missingBehavior: "fallback" as const,
      fallback: "0",
    },
  ];

  it("renders literals, repeated typed inputs, Unicode, and escaped placeholders", () => {
    expect(
      executeTextTemplate({
        template: String.raw`Xin chào {{name}} — {{count}} / {{name}} / \{{literal}}`,
        placeholders,
        resolvedConfig: { [`value.${nameId}`]: "Hà", [`value.${countId}`]: 3 },
      }),
    ).toEqual({ ok: true, output: { text: "Xin chào Hà — 3 / Hà / {{literal}}" } });
  });

  it("applies optional and fallback behavior and rejects a missing required value", () => {
    expect(
      executeTextTemplate({
        template: "{{name}} {{count}}",
        placeholders: [{ ...placeholders[0]!, missingBehavior: "optional" }, placeholders[1]!],
        resolvedConfig: {},
      }),
    ).toEqual({ ok: true, output: { text: " 0" } });
    expect(
      executeTextTemplate({ template: "{{name}}", placeholders, resolvedConfig: {} }),
    ).toMatchObject({
      ok: false,
      error: { code: "missing_text_input", inputId: nameId },
    });
  });

  it("returns HTML and Markdown-looking input as ordinary untrusted text", () => {
    expect(
      executeTextTemplate({
        template: "{{name}}",
        placeholders,
        resolvedConfig: { [`value.${nameId}`]: "<script>alert(1)</script> **bold**" },
      }),
    ).toEqual({
      ok: true,
      output: { text: "<script>alert(1)</script> **bold**" },
    });
  });

  it("rejects malformed templates, unknown placeholders, circular values, and large output", () => {
    expect(
      executeTextTemplate({ template: "{{name", placeholders, resolvedConfig: {} }),
    ).toMatchObject({ ok: false, error: { code: "invalid_text_template" } });
    expect(
      executeTextTemplate({ template: "{{other}}", placeholders, resolvedConfig: {} }),
    ).toMatchObject({ ok: false, error: { code: "unknown_text_placeholder" } });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(
      executeTextTemplate({
        template: "{{name}}",
        placeholders: [{ ...placeholders[0]!, type: "unknown" }],
        resolvedConfig: { [`value.${nameId}`]: circular },
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_text_value", inputId: nameId } });
    expect(
      executeTextTemplate({
        template: "{{name}}",
        placeholders,
        resolvedConfig: { [`value.${nameId}`]: "é".repeat(TEXT_NODE_LIMITS.maxOutputBytes) },
      }),
    ).toMatchObject({ ok: false, error: { code: "text_output_too_large" } });
  });

  it("runs through binding resolution and the production logic executor", () => {
    const node: CanonicalVisualWorkflowNode = {
      id: "template",
      type: "logic.text_template",
      config: { kind: "logic.text_template", template: "Hello {{name}}", placeholders },
      inputs: {
        [`value.${nameId}`]: { kind: "reference", nodeId: "source", path: ["name"] },
      },
    };
    const resolved = resolveWorkflowNodeInputs(node, context);
    expect(
      executeLogicVisualWorkflowNode({ node: resolved, context, inputsResolved: true }),
    ).toEqual({ ok: true, output: { text: "Hello Ada" } });
  });

  it("uses fallback when a wired optional path is missing", () => {
    const node: CanonicalVisualWorkflowNode = {
      id: "template",
      type: "logic.text_template",
      config: { kind: "logic.text_template", template: "Hello {{name}}: {{count}}", placeholders },
      inputs: {
        [`value.${nameId}`]: { kind: "reference", nodeId: "source", path: ["name"] },
        [`value.${countId}`]: {
          kind: "reference",
          nodeId: "source",
          path: ["missing"],
          optional: true,
        },
      },
    };
    const resolved = resolveWorkflowNodeInputs(node, context);
    expect(
      executeLogicVisualWorkflowNode({ node: resolved, context, inputsResolved: true }),
    ).toEqual({ ok: true, output: { text: "Hello Ada: 0" } });
  });
});

describe("Concatenate workflow node", () => {
  it("joins ordered literal and typed inputs with a deterministic separator", () => {
    expect(
      executeConcatenate({
        separator: " | ",
        segments: [
          { id: "literal", kind: "literal", value: "Count" },
          {
            id: countId,
            kind: "input",
            name: "count",
            type: "number",
            missingBehavior: "required",
          },
          {
            id: nameId,
            kind: "input",
            name: "metadata",
            type: "object",
            missingBehavior: "required",
          },
        ],
        resolvedConfig: {
          [`value.${countId}`]: 3,
          [`value.${nameId}`]: { locale: "de" },
        },
      }),
    ).toEqual({ ok: true, output: { text: 'Count | 3 | {"locale":"de"}' } });
  });

  it("applies optional and fallback behavior and rejects a missing required segment", () => {
    const segments = [
      { id: "literal", kind: "literal" as const, value: "Hello" },
      {
        id: nameId,
        kind: "input" as const,
        name: "name",
        type: "string" as const,
        missingBehavior: "optional" as const,
      },
      {
        id: countId,
        kind: "input" as const,
        name: "count",
        type: "number" as const,
        missingBehavior: "fallback" as const,
        fallback: "0",
      },
    ];
    expect(executeConcatenate({ separator: " ", segments, resolvedConfig: {} })).toEqual({
      ok: true,
      output: { text: "Hello  0" },
    });
    expect(
      executeConcatenate({
        separator: " ",
        segments: [
          {
            id: nameId,
            kind: "input",
            name: "name",
            type: "string",
            missingBehavior: "required",
          },
        ],
        resolvedConfig: {},
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "missing_text_input", inputId: nameId },
    });
  });

  it("counts separators toward the output limit", () => {
    expect(
      executeConcatenate({
        separator: "-".repeat(TEXT_NODE_LIMITS.maxOutputBytes),
        segments: [
          { id: "first", kind: "literal", value: "a" },
          { id: "second", kind: "literal", value: "b" },
        ],
        resolvedConfig: {},
      }),
    ).toMatchObject({ ok: false, error: { code: "text_output_too_large" } });
  });
});

describe("Text node playground integration", () => {
  it("passes stable dynamic inputs through a template and concatenate workflow", async () => {
    const literalId = "11111111-2222-4222-8222-111111111111";
    const renderedId = "22222222-3333-4333-8333-222222222222";
    const templatePlaceholders = [
      { id: nameId, name: "name", type: "string" as const, missingBehavior: "required" as const },
      {
        id: countId,
        name: "count",
        type: "number" as const,
        missingBehavior: "fallback" as const,
        fallback: "0",
      },
    ];
    const nodes: VisualWorkflowRfNode[] = [
      {
        id: "trigger",
        type: "trigger.manual",
        position: { x: 0, y: 0 },
        data: {
          catalogType: "trigger.manual",
          config: { kind: "trigger.manual" },
          outputFields: [
            { path: "name", type: "string" },
            { path: "count", type: "number" },
          ],
          runStatus: "idle",
        },
      },
      {
        id: "template",
        type: "logic.text_template",
        position: { x: 300, y: 0 },
        data: {
          catalogType: "logic.text_template",
          config: {
            kind: "logic.text_template",
            template: "Hello {{name}}: {{count}}",
            placeholders: templatePlaceholders,
          },
          runStatus: "idle",
        },
      },
      {
        id: "concatenate",
        type: "logic.concatenate",
        position: { x: 600, y: 0 },
        data: {
          catalogType: "logic.concatenate",
          config: {
            kind: "logic.concatenate",
            separator: " ",
            segments: [
              { id: literalId, kind: "literal", value: "Preview:" },
              {
                id: renderedId,
                kind: "input",
                name: "rendered",
                type: "string",
                missingBehavior: "required",
              },
            ],
          },
          runStatus: "idle",
        },
      },
    ];
    const edges: VisualWorkflowRfEdge[] = [
      { id: "execution-1", source: "trigger", target: "template" },
      {
        id: "data-name",
        source: "trigger",
        target: "template",
        sourceHandle: "name",
        targetHandle: `value.${nameId}`,
        data: { kind: "data" },
      },
      {
        id: "data-count",
        source: "trigger",
        target: "template",
        sourceHandle: "count",
        targetHandle: `value.${countId}`,
        data: { kind: "data" },
      },
      { id: "execution-2", source: "template", target: "concatenate" },
      {
        id: "data-rendered",
        source: "template",
        target: "concatenate",
        sourceHandle: "text",
        targetHandle: `value.${renderedId}`,
        data: { kind: "data" },
      },
    ];
    const outputs: Record<string, Record<string, unknown>> = {};
    const errors: Record<string, Record<string, unknown>> = {};
    const statuses: string[] = [];

    const result = await runPlaygroundWorkflow({
      name: "Text nodes",
      nodes,
      edges,
      triggerInput: { name: "Ada", count: 3 },
      onStatus: (nodeId, status) => statuses.push(`${nodeId}:${status}`),
      onOutput: (nodeId, output, error) => {
        if (output) outputs[nodeId] = output;
        if (error) errors[nodeId] = error;
      },
    });

    expect({ result, errors, statuses, outputs }).toEqual(
      expect.objectContaining({ result: "completed", errors: {} }),
    );
    expect(outputs.template).toEqual({ text: "Hello Ada: 3" });
    expect(outputs.concatenate).toEqual({ text: "Preview: Hello Ada: 3" });
  });
});
