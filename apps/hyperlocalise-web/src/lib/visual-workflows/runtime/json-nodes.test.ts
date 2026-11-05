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

import type { CanonicalVisualWorkflowEdge } from "../schema/types";
import { executeLogicVisualWorkflowNode } from "./execute-logic-node";
import { selectNextEdges } from "./graph-index";
import {
  JSON_NODE_LIMITS,
  executeJsonParse,
  executeJsonStringify,
  executeSchemaValidate,
} from "./json-nodes";

describe("JSON workflow nodes", () => {
  it("parses bounded JSON and rejects malformed text without exposing it", () => {
    expect(executeJsonParse('{"name":"Ada","active":true}')).toEqual({
      ok: true,
      output: { value: { name: "Ada", active: true } },
      switchCase: "success",
    });

    const malformed = executeJsonParse('{"secret":"do-not-display"');
    expect(malformed).toMatchObject({
      ok: true,
      output: { error: { code: "invalid_json_syntax", path: "$" } },
      switchCase: "invalid",
    });
    expect(JSON.stringify(malformed)).not.toContain("do-not-display");
  });

  it("rejects dangerous keys and excessive parse input", () => {
    expect(executeJsonParse('{"nested":{"__proto__":{"polluted":true}}}')).toMatchObject({
      ok: true,
      output: { error: { code: "unsafe_json_key", path: "$.nested.__proto__" } },
      switchCase: "invalid",
    });
    expect(executeJsonParse(`"${"a".repeat(JSON_NODE_LIMITS.maxBytes)}"`)).toMatchObject({
      ok: true,
      output: { error: { code: "json_too_large" } },
      switchCase: "invalid",
    });
  });

  it("stringifies JSON deterministically and reports cycles on the error branch", () => {
    expect(executeJsonStringify({ name: "Ada", count: 2 })).toEqual({
      ok: true,
      output: { text: '{"name":"Ada","count":2}' },
      switchCase: "success",
    });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(executeJsonStringify(circular)).toMatchObject({
      ok: true,
      output: { error: { code: "circular_json_value", path: "$.self" } },
      switchCase: "error",
    });
  });

  it("validates supported schemas and returns bounded display-safe errors", () => {
    const schema = {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string", minLength: 2 } },
      additionalProperties: false,
    };

    expect(executeSchemaValidate({ name: "Ada" }, schema)).toEqual({
      ok: true,
      output: { value: { name: "Ada" }, valid: true, errors: [] },
      switchCase: "success",
    });
    expect(executeSchemaValidate({ name: "", extra: true }, schema)).toMatchObject({
      ok: true,
      output: {
        valid: false,
        errors: [
          { code: "schema_min_length", path: "$.name" },
          { code: "schema_additional_property", path: "$.extra" },
        ],
      },
      switchCase: "invalid",
    });
  });

  it("refuses schema references and unsupported executable-style keywords", () => {
    expect(executeSchemaValidate({}, { $ref: "https://example.test/schema.json" })).toMatchObject({
      ok: true,
      output: { valid: false, errors: [{ code: "schema_reference_forbidden" }] },
      switchCase: "invalid",
    });
    expect(executeSchemaValidate({}, { format: "custom-code" })).toMatchObject({
      ok: true,
      output: { valid: false, errors: [{ code: "unsupported_schema_keyword" }] },
      switchCase: "invalid",
    });
    expect(executeSchemaValidate({}, { required: "name" })).toMatchObject({
      ok: true,
      output: { valid: false, errors: [{ code: "invalid_json_schema" }] },
      switchCase: "invalid",
    });
  });

  it("executes resolved node configs through the logic executor", () => {
    expect(
      executeLogicVisualWorkflowNode({
        node: {
          id: "parse",
          type: "logic.json_parse",
          config: { kind: "logic.json_parse", text: "[1,2,3]" },
        },
        context: { trigger: {}, nodes: {} },
        inputsResolved: true,
      }),
    ).toMatchObject({ ok: true, output: { value: [1, 2, 3] }, switchCase: "success" });
  });

  it.each([
    ["logic.json_parse", "invalid"],
    ["logic.json_stringify", "error"],
    ["logic.schema_validate", "invalid"],
  ] as const)("routes %s only through its selected %s branch", (nodeType, switchCase) => {
    const outgoing: CanonicalVisualWorkflowEdge[] = ["success", switchCase].map((sourceHandle) => ({
      id: `edge-${sourceHandle}`,
      source: "json",
      target: `after-${sourceHandle}`,
      sourceHandle,
      targetHandle: null,
    }));

    expect(
      selectNextEdges({
        nodeType,
        branchResult: null,
        switchCase,
        useErrorBranch: false,
        outgoing,
      }).map((edge) => edge.sourceHandle),
    ).toEqual([switchCase]);
  });
});
