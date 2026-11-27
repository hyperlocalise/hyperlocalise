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
import { NODE_CONTRACTS } from "../catalog/node-contracts";
import { VISUAL_NODE_DESCRIPTIONS } from "../catalog/node-descriptions";
import { resolveWorkflowNodeInputs } from "../runtime/bindings";
import { compileWorkflowIssues } from "../validation/compile-workflow";
import {
  isExternalVisualWorkflowNode,
  isRepeatableVisualWorkflowAction,
} from "../validation/retry-idempotency";
import { visualNodeConfigSchema, visualWorkflowV3DefinitionSchema } from "./definition-schema";
import { fromVisualWorkflowV3Definition, toVisualWorkflowV3Definition } from "./serializers";

const configured = {
  kind: "action.create_translation_job" as const,
  sourceKind: "string" as const,
  projectId: "project_123",
  sourceText: "Hello",
  sourceFileId: "",
  sourceLocale: "en-AU",
  targetLocales: "fr-FR,de-DE",
  instructions: "Keep product names unchanged.",
  contextOverrides: '{"domain":"commerce"}',
  onError: "branch" as const,
};

describe("Create translation job configuration", () => {
  it("provides bounded defaults and a catalog description", () => {
    expect(createDefaultConfig("action.create_translation_job")).toEqual({
      kind: "action.create_translation_job",
      sourceKind: "string",
      projectId: "",
      sourceText: "",
      sourceFileId: "",
      sourceLocale: "",
      targetLocales: "",
      instructions: "",
      contextOverrides: "",
      onError: "stop",
    });
    expect(VISUAL_NODE_DESCRIPTIONS["action.create_translation_job"].title).toBe(
      "Create translation job",
    );
  });

  it("declares stable typed input and output ports", () => {
    expect(NODE_CONTRACTS["action.create_translation_job"]).toEqual({
      inputs: [
        { name: "projectId", type: "string", required: true },
        { name: "sourceText", type: "string", required: false },
        { name: "sourceFileId", type: "string", required: false },
        { name: "sourceLocale", type: "string", required: true },
        { name: "targetLocales", type: "array", required: true },
        { name: "instructions", type: "string", required: false },
        { name: "contextOverrides", type: "object", required: false },
      ],
      outputs: [
        { path: "jobId", type: "string", optional: false },
        { path: "status", type: "string", optional: false },
        { path: "targetLocales", type: "array", optional: false },
        { path: "createdAt", type: "string", optional: false },
      ],
      mock: {
        jobId: "job_mock_translation",
        status: "queued",
        targetLocales: ["fr-FR", "de-DE"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  it("accepts both source modes and rejects oversized source text", () => {
    expect(visualNodeConfigSchema.safeParse(configured).success).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({
        ...configured,
        sourceKind: "file",
        sourceText: "",
        sourceFileId: "file_123",
      }).success,
    ).toBe(true);
    expect(
      visualNodeConfigSchema.safeParse({ ...configured, sourceText: "x".repeat(100_001) }).success,
    ).toBe(false);
  });

  it("round-trips the node without changing its stable contract", () => {
    const original = {
      schemaVersion: 3 as const,
      name: "Create a translation job",
      nodes: [
        {
          id: "create-job",
          type: "action.create_translation_job" as const,
          config: configured,
        },
      ],
      edges: [],
      editor: { positions: { "create-job": { x: 0, y: 0 } } },
    };

    const parsed = visualWorkflowV3DefinitionSchema.parse(original);
    expect(toVisualWorkflowV3Definition(fromVisualWorkflowV3Definition(parsed))).toEqual(original);
  });

  it("requires the source selected by sourceKind when compiling", () => {
    const definition = {
      schemaVersion: 2 as const,
      name: "Create translation job",
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual" as const,
          config: { kind: "trigger.manual" as const },
        },
        {
          id: "create-job",
          type: "action.create_translation_job" as const,
          config: { ...configured, sourceKind: "file" as const, sourceFileId: "" },
        },
      ],
      edges: [
        {
          id: "trigger-create-job",
          source: "trigger",
          target: "create-job",
          sourceHandle: null,
          targetHandle: null,
        },
      ],
      editor: {
        positions: {
          trigger: { x: 0, y: 0 },
          "create-job": { x: 320, y: 0 },
        },
      },
    };

    expect(compileWorkflowIssues(definition)).toContainEqual({
      code: "invalid_node_config",
      nodeId: "create-job",
      edgeId: undefined,
      field: "sourceFileId",
      reason: "required",
    });
  });

  it("resolves structured context overrides without changing stable port names", () => {
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "create-job",
        type: "action.create_translation_job",
        config: configured,
      },
      { trigger: {}, nodes: {} },
    );

    expect(resolved.config).toMatchObject({
      sourceText: "Hello",
      contextOverrides: { domain: "commerce" },
      targetLocales: ["fr-FR", "de-DE"],
    });
  });

  it("parses JSON target locales from trigger templates", () => {
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "create-job",
        type: "action.create_translation_job",
        config: { ...configured, targetLocales: "{{ trigger.targetLocales }}" },
      },
      { trigger: { targetLocales: ["fr-FR", "de-DE"] }, nodes: {} },
    );

    expect(resolved.config).toMatchObject({ targetLocales: ["fr-FR", "de-DE"] });
  });

  it("leaves a blank target locale list empty so the action can require it", () => {
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "create-job",
        type: "action.create_translation_job",
        config: { ...configured, targetLocales: "{{ trigger.targetLocales }}" },
      },
      { trigger: { targetLocales: [] }, nodes: {} },
    );

    expect(resolved.config).toMatchObject({ targetLocales: [] });
  });

  it("keeps an empty optional context override absent", () => {
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "create-job",
        type: "action.create_translation_job",
        config: { ...configured, contextOverrides: "" },
      },
      { trigger: {}, nodes: {} },
    );

    expect(
      resolved.config.kind === "action.create_translation_job"
        ? resolved.config.contextOverrides
        : "unexpected config",
    ).toBeUndefined();
  });

  it("rejects malformed inline context overrides during compilation", () => {
    const definition = {
      schemaVersion: 2 as const,
      name: "Invalid context",
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual" as const,
          config: { kind: "trigger.manual" as const },
        },
        {
          id: "create-job",
          type: "action.create_translation_job" as const,
          config: { ...configured, contextOverrides: "[]" },
        },
      ],
      edges: [
        {
          id: "trigger-create-job",
          source: "trigger",
          target: "create-job",
          sourceHandle: null,
          targetHandle: null,
        },
      ],
      editor: {
        positions: {
          trigger: { x: 0, y: 0 },
          "create-job": { x: 320, y: 0 },
        },
      },
    };

    expect(compileWorkflowIssues(definition)).toContainEqual({
      code: "invalid_node_config",
      nodeId: "create-job",
      edgeId: undefined,
      field: "contextOverrides",
      reason: "invalid",
    });
  });

  it("treats the durable idempotent node as external and repeatable", () => {
    expect(isExternalVisualWorkflowNode("action.create_translation_job")).toBe(true);
    expect(isRepeatableVisualWorkflowAction("action.create_translation_job")).toBe(true);
  });
});
