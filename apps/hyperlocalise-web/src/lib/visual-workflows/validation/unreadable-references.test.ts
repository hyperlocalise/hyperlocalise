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
import { resolveWorkflowNodeInputs } from "../runtime/bindings";
import { createVisualWorkflowExecutionContext, setNodeOutput } from "../runtime/context";
import { executeLogicVisualWorkflowNode } from "../runtime/execute-logic-node";
import type { CanonicalVisualWorkflowNode, VisualCatalogType } from "../schema/types";
import { listUnreadableWorkflowReferences } from "./unreadable-references";

function step(
  type: VisualCatalogType,
  config: Record<string, unknown> = {},
  inputs?: CanonicalVisualWorkflowNode["inputs"],
): CanonicalVisualWorkflowNode {
  return {
    id: "step",
    type,
    config: { ...createDefaultConfig(type), ...config } as CanonicalVisualWorkflowNode["config"],
    ...(inputs ? { inputs } : {}),
  };
}

/** A run in the middle of a Loop's first item, as the step would meet it. */
function runContext() {
  const context = createVisualWorkflowExecutionContext({ triggerInput: { ref: "main" } });
  setNodeOutput(context, "for_each", {
    item: { projectId: "project_1", sourceFileId: "file_1", targetLocale: "fr-FR", path: "a.json" },
    index: 0,
    count: 1,
  });
  return context;
}

/** Whether a run stops at the step: filling in its settings, or running a Switch or Set step. */
function runStops(node: CanonicalVisualWorkflowNode) {
  try {
    const resolved = resolveWorkflowNodeInputs(node, runContext());
    const result = executeLogicVisualWorkflowNode({
      node: resolved,
      context: runContext(),
      inputsResolved: true,
    });
    return !result.ok && result.error.code !== "not_logic_node";
  } catch {
    return true;
  }
}

const ASSIGN_TASK_SHORT = step("action.create_task", {
  projectId: "{{ item.projectId }}",
  sourceFileId: "{{ item.sourceFileId }}",
  targetLocales: "{{ item.targetLocale }}",
  title: "Proofread: {{ item.path }}",
});

const ASSIGN_TASK_FULL = step("action.create_task", {
  projectId: "{{ nodes.for_each.item.projectId }}",
  sourceFileId: "{{ nodes.for_each.item.sourceFileId }}",
  targetLocales: "{{ nodes.for_each.item.targetLocale }}",
  title: "Proofread: {{ nodes.for_each.item.path }} on {{ trigger.ref }}",
});

describe("listUnreadableWorkflowReferences", () => {
  it("names a loop's item written in the short form, setting by setting", () => {
    expect(listUnreadableWorkflowReferences(ASSIGN_TASK_SHORT)).toEqual([
      { field: "projectId", reference: "{{ item.projectId }}" },
      { field: "sourceFileId", reference: "{{ item.sourceFileId }}" },
      { field: "targetLocales", reference: "{{ item.targetLocale }}" },
      { field: "title", reference: "{{ item.path }}" },
    ]);
    expect(runStops(ASSIGN_TASK_SHORT)).toBe(true);
  });

  it("passes a loop's item read through the Loop step, and the trigger", () => {
    expect(listUnreadableWorkflowReferences(ASSIGN_TASK_FULL)).toEqual([]);
    expect(runStops(ASSIGN_TASK_FULL)).toBe(false);
  });

  it("names a root on its own and an empty reference", () => {
    const node = step("action.notify_slack", {
      channelId: "C1",
      message: "{{ trigger }} {{ index }} {{ }}",
    });

    expect(listUnreadableWorkflowReferences(node).map((entry) => entry.reference)).toEqual([
      "{{ trigger }}",
      "{{ index }}",
      "{{ }}",
    ]);
    expect(runStops(node)).toBe(true);
  });

  it("leaves a setting fed by a stored input or a wire, whose text a run ignores", () => {
    const text = { channelId: "C1", message: "{{ item.name }}" };
    const stored = step("action.notify_slack", text, {
      message: { kind: "reference", nodeId: "for_each", path: ["item", "path"] },
    });

    expect(listUnreadableWorkflowReferences(stored)).toEqual([]);
    expect(runStops(stored)).toBe(false);
    expect(
      listUnreadableWorkflowReferences(step("action.notify_slack", text), ["message"]),
    ).toEqual([]);
  });

  it("leaves a Text template's own placeholders", () => {
    const node = step("logic.text_template", {
      template: "Hello {{ name }}",
      placeholders: [
        { id: "p1", name: "name", type: "string", missingBehavior: "optional", fallback: "" },
      ],
    });

    expect(listUnreadableWorkflowReferences(node)).toEqual([]);
    expect(runStops(node)).toBe(false);
  });

  it("leaves a setting a run keeps as written, such as a sync step's file name pattern", () => {
    const node = step("action.content_sync", {
      projectId: "project_1",
      connectionId: "3",
      resourceKey: "group/repo",
      projectFolder: "gitlab/repo",
      pathTemplate: "{{locale}}.json",
    });

    expect(listUnreadableWorkflowReferences(node)).toEqual([]);
    expect(runStops(node)).toBe(false);
  });

  it("names a Loop's list only when the whole setting is one reference", () => {
    const whole = step("logic.for_each", { collection: "{{ items }}" });
    const json = step("logic.for_each", { collection: '["{{ item.name }}"]' });

    expect(listUnreadableWorkflowReferences(whole)).toEqual([
      { field: "collection", reference: "{{ items }}" },
    ]);
    expect(runStops(whole)).toBe(true);
    expect(listUnreadableWorkflowReferences(json)).toEqual([]);
    expect(runStops(json)).toBe(false);
  });

  it("names Switch cases and Set values", () => {
    const switchStep = step("logic.switch", {
      expression: "{{ trigger.ref }}",
      cases: [{ id: "case_1", value: "{{ item.name }}" }],
    });
    const setStep = step("logic.set", {
      assignments: [{ key: "locale", value: "{{ item.targetLocale }}" }],
    });

    expect(listUnreadableWorkflowReferences(switchStep)).toEqual([
      { field: "cases", reference: "{{ item.name }}" },
    ]);
    expect(runStops(switchStep)).toBe(true);
    expect(listUnreadableWorkflowReferences(setStep)).toEqual([
      { field: "assignments", reference: "{{ item.targetLocale }}" },
    ]);
    expect(runStops(setStep)).toBe(true);
  });

  it("names an HTTP request's headers, query and body where a run fills them in", () => {
    const request = {
      url: "https://example.com",
      headers: [{ key: "X-Item", value: "{{ item.a }}" }],
      queryParams: [{ key: "q", value: "{{ item.b }}" }],
      bodyType: "json",
      body: '{"file":{"name":"{{ item.c }}"},"ref":"{{ trigger.ref }}"}',
    };
    const post = step("action.http", { ...request, method: "POST" });
    const get = step("action.http", {
      url: request.url,
      method: "GET",
      bodyType: "json",
      body: request.body,
    });
    const noBody = step("action.http", {
      url: request.url,
      method: "POST",
      bodyType: "none",
      body: request.body,
    });

    expect(listUnreadableWorkflowReferences(post)).toEqual([
      { field: "headers", reference: "{{ item.a }}" },
      { field: "queryParams", reference: "{{ item.b }}" },
      { field: "body", reference: "{{ item.c }}" },
    ]);
    expect(runStops(post)).toBe(true);
    // A GET sends no body, and a body switched off is not sent either.
    expect(listUnreadableWorkflowReferences(get)).toEqual([]);
    expect(runStops(get)).toBe(false);
    expect(listUnreadableWorkflowReferences(noBody)).toEqual([]);
    expect(runStops(noBody)).toBe(false);
  });
});
