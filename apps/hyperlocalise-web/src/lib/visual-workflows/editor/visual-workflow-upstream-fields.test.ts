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
import type { VisualWorkflowRfEdge, VisualWorkflowRfNode } from "../schema/types";
import {
  fieldReference,
  listUpstreamFields,
  observedOutputFields,
  readsFields,
  splitTemplate,
} from "./visual-workflow-upstream-fields";

function node(id: string, type: VisualWorkflowRfNode["type"]): VisualWorkflowRfNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { catalogType: type, config: createDefaultConfig(type), runStatus: "idle" },
  };
}

function edge(source: string, target: string): VisualWorkflowRfEdge {
  return { id: `${source}-${target}`, source, target, data: { kind: "execution" } };
}

describe("listUpstreamFields", () => {
  const trigger = node("trigger", "trigger.manual");
  const http = node("http", "action.http");
  const slack = node("slack", "action.notify_slack");
  const later = node("later", "action.notify_email");
  const edges = [edge("trigger", "http"), edge("http", "slack"), edge("slack", "later")];

  it("lists the declared fields of every earlier step, and none of a later one", () => {
    const fields = listUpstreamFields({ node: slack, nodes: [trigger, http, slack, later], edges });

    expect(fields.map((field) => `${field.nodeId}.${field.path}`)).toEqual([
      "trigger.triggeredAt",
      "http.status",
      "http.ok",
      "http.headers",
      "http.body",
      "http.json",
    ]);
    expect(fields[0]).toMatchObject({ trigger: true, observed: false, type: "string" });
  });

  it("adds the fields seen in a step's test data before any run, with their samples", () => {
    const fields = listUpstreamFields({
      node: slack,
      nodes: [trigger, http, slack],
      edges,
      testData: { http: { json: { reviewers: "ana@acme.dev", count: 2 } } },
    });

    expect(fields.filter((field) => field.observed)).toEqual([
      expect.objectContaining({ path: "json.reviewers", type: "string", sample: "ana@acme.dev" }),
      expect.objectContaining({ path: "json.count", type: "number", sample: 2 }),
    ]);
  });

  it("prefers what a step returned in the last run over its test data", () => {
    const ran = { ...http, data: { ...http.data, lastOutput: { json: { items: [1] } } } };
    const fields = listUpstreamFields({
      node: slack,
      nodes: [trigger, ran, slack],
      edges,
      testData: { http: { json: { reviewers: "ana@acme.dev" } } },
    });

    expect(fields.filter((field) => field.observed).map((field) => field.path)).toEqual([
      "json.items",
    ]);
  });
});

describe("observedOutputFields", () => {
  it("names a field's type from its value and does not descend into lists", () => {
    expect(
      observedOutputFields({ a: "x", n: 1, yes: true, list: [{ deep: 1 }], obj: { k: null } }),
    ).toEqual([
      { path: "a", type: "string", optional: true },
      { path: "n", type: "number", optional: true },
      { path: "yes", type: "boolean", optional: true },
      { path: "list", type: "array", optional: true },
      { path: "obj", type: "object", optional: true },
      { path: "obj.k", type: "unknown", optional: true },
    ]);
  });
});

describe("fieldReference and splitTemplate", () => {
  it("writes a trigger's field and a step's field the way a run reads them", () => {
    expect(fieldReference({ nodeId: "t", trigger: true, path: "projectId" })).toBe(
      "{{ trigger.projectId }}",
    );
    expect(fieldReference({ nodeId: "http", trigger: false, path: "json.count" })).toBe(
      "{{ nodes.http.json.count }}",
    );
  });

  it("splits text into its words and the fields it reads", () => {
    expect(splitTemplate("Hi, {{ nodes.http.json.count }} new for {{trigger.locale}}!")).toEqual([
      { kind: "text", text: "Hi, " },
      {
        kind: "reference",
        raw: "{{ nodes.http.json.count }}",
        nodeId: "http",
        trigger: false,
        path: ["json", "count"],
      },
      { kind: "text", text: " new for " },
      {
        kind: "reference",
        raw: "{{trigger.locale}}",
        nodeId: null,
        trigger: true,
        path: ["locale"],
      },
      { kind: "text", text: "!" },
    ]);
  });

  it("keeps an expression it does not know as a reference without a step", () => {
    expect(splitTemplate("{{ something.else }}")).toEqual([
      {
        kind: "reference",
        raw: "{{ something.else }}",
        nodeId: null,
        trigger: false,
        path: ["something", "else"],
      },
    ]);
    expect(readsFields("plain text")).toBe(false);
    expect(readsFields("a {{ nodes.x.y }}")).toBe(true);
  });
});
