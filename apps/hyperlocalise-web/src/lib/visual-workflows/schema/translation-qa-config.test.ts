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
import { resolveWorkflowNodeInputs } from "../runtime/bindings";
import { compileWorkflowIssues } from "../validation/compile-workflow";
import { visualNodeConfigSchema } from "./definition-schema";
import type { VisualNodeConfig, VisualWorkflowDefinition } from "./types";

type TranslationQaConfig = Extract<VisualNodeConfig, { kind: "action.run_qa" }>;

const inlineConfig: TranslationQaConfig = {
  ...(createDefaultConfig("action.run_qa") as TranslationQaConfig),
  mode: "inline" as const,
  projectId: "project_1",
  source: "Hello {name}",
  translation: "Bonjour {name}",
  sourceLocale: "en-AU",
  targetLocale: "fr-FR",
  selectedChecks: ["placeholder_mismatch", "glossary_violation"],
};

function workflow(config: TranslationQaConfig): VisualWorkflowDefinition {
  return {
    schemaVersion: 2 as const,
    name: "Translation QA",
    nodes: [
      {
        id: "trigger",
        type: "trigger.manual" as const,
        config: { kind: "trigger.manual" as const },
      },
      { id: "qa", type: "action.run_qa" as const, config },
    ],
    edges: [
      {
        id: "trigger-qa",
        source: "trigger",
        target: "qa",
        sourceHandle: null,
        targetHandle: null,
      },
    ],
    editor: { positions: { trigger: { x: 0, y: 0 }, qa: { x: 320, y: 0 } } },
  };
}

describe("Translation QA workflow node contract", () => {
  it("keeps legacy project QA configurations valid and supplies bounded defaults", () => {
    const parsed = visualNodeConfigSchema.parse({
      kind: "action.run_qa",
      projectId: "project_1",
      sourceFileId: "file_1",
      targetLocales: "fr-FR, de-DE",
    });

    expect(parsed).toMatchObject({
      kind: "action.run_qa",
      mode: "project",
      projectId: "project_1",
      source: "",
      translation: "",
      sourceLocale: "",
      targetLocale: "",
      projectPolicies: {},
      glossaryReferences: [],
      translationMemoryReferences: [],
      selectedChecks: [],
    });
  });

  it("provides an explicit project-mode default", () => {
    expect(createDefaultConfig("action.run_qa")).toEqual({
      kind: "action.run_qa",
      mode: "project",
      projectId: "",
      source: "",
      translation: "",
      sourceLocale: "",
      targetLocale: "",
      projectPolicies: {},
      glossaryReferences: [],
      translationMemoryReferences: [],
      selectedChecks: [],
      onError: "stop",
    });
  });

  it("accepts a bounded inline translation pair and selected checks", () => {
    expect(
      visualNodeConfigSchema.safeParse({
        ...createDefaultConfig("action.run_qa"),
        mode: "inline",
        projectId: "project_1",
        source: "Hello {name}",
        translation: "Bonjour {name}",
        sourceLocale: "en-AU",
        targetLocale: "fr-FR",
        selectedChecks: ["placeholder_mismatch", "glossary_violation", "guideline"],
        glossaryReferences: [{ sourceTerm: "Hello", targetTerm: "Bonjour" }],
        translationMemoryReferences: [{ source: "Hello", translation: "Bonjour" }],
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported checks and oversized inline text", () => {
    const base = createDefaultConfig("action.run_qa");
    expect(
      visualNodeConfigSchema.safeParse({ ...base, selectedChecks: ["unsafe_check"] }).success,
    ).toBe(false);
    expect(visualNodeConfigSchema.safeParse({ ...base, source: "x".repeat(100_001) }).success).toBe(
      false,
    );
  });

  it("declares stable typed ports and bounded inspectable outputs", () => {
    const contract = NODE_CONTRACTS["action.run_qa"];
    expect(contract.inputs).toEqual(
      expect.arrayContaining([
        { name: "source", type: "string", required: false },
        { name: "translation", type: "string", required: false },
        { name: "sourceLocale", type: "string", required: false },
        { name: "targetLocale", type: "string", required: false },
        { name: "projectPolicies", type: "object", required: false },
        { name: "glossaryReferences", type: "array", required: false },
        { name: "translationMemoryReferences", type: "array", required: false },
        { name: "selectedChecks", type: "array", required: false },
      ]),
    );
    expect(contract.outputs).toEqual(
      expect.arrayContaining([
        { path: "findings", type: "array", optional: true },
        { path: "suggestedCorrections", type: "array", optional: true },
        { path: "deterministicFindingCount", type: "number", optional: true },
        { path: "modelFindingCount", type: "number", optional: true },
        { path: "modelChecksSkipped", type: "boolean", optional: true },
        { path: "findingsTruncated", type: "boolean", optional: true },
      ]),
    );
  });

  it("requires a complete inline locale pair at compile time", () => {
    expect(
      compileWorkflowIssues(workflow({ ...inlineConfig, translation: "", targetLocale: "" })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_node_config",
          nodeId: "qa",
          field: "translation",
          reason: "required",
        }),
        expect.objectContaining({
          code: "invalid_node_config",
          nodeId: "qa",
          field: "targetLocale",
          reason: "required",
        }),
      ]),
    );
  });

  it("rejects identical inline locales and duplicate selected checks", () => {
    const issues = compileWorkflowIssues(
      workflow({
        ...inlineConfig,
        sourceLocale: "en-AU",
        targetLocale: "EN-au",
        selectedChecks: ["placeholder_mismatch", "placeholder_mismatch"],
      }),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "targetLocale", reason: "invalid" }),
        expect.objectContaining({ field: "selectedChecks", reason: "invalid" }),
      ]),
    );
  });

  it("normalizes legacy project target locales during binding", () => {
    const config: TranslationQaConfig = {
      ...(createDefaultConfig("action.run_qa") as TranslationQaConfig),
      projectId: "project_1",
      targetLocales: "fr-FR, de-DE",
    };
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "qa",
        type: "action.run_qa",
        config,
      },
      { trigger: {}, nodes: {} },
    );

    expect(resolved.config).toMatchObject({ targetLocales: ["fr-FR", "de-DE"] });
  });

  it("expands unbound inline text templates and preserves structured references", () => {
    const config: TranslationQaConfig = {
      ...inlineConfig,
      source: "Hello {{trigger.name}}",
      projectPolicies: { tone: "formal" },
      glossaryReferences: [{ sourceTerm: "Hello", targetTerm: "Bonjour" }],
    };
    const resolved = resolveWorkflowNodeInputs(
      {
        id: "qa",
        type: "action.run_qa",
        config,
      },
      { trigger: { name: "Ada" }, nodes: {} },
    );

    expect(resolved.config).toMatchObject({
      source: "Hello Ada",
      projectPolicies: { tone: "formal" },
      glossaryReferences: [{ sourceTerm: "Hello", targetTerm: "Bonjour" }],
    });
  });
});
