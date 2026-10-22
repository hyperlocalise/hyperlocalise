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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { meteringMock, resolveHyperlocaliseAgentLanguageModelMock, toolLoopAgentCtor } = vi.hoisted(
  () => ({
    meteringMock: vi.fn(async (_input: unknown) => ({ text: "" })),
    resolveHyperlocaliseAgentLanguageModelMock: vi.fn(),
    toolLoopAgentCtor: vi.fn(function ToolLoopAgent(_settings: unknown) {
      return { generate: vi.fn() };
    }),
  }),
);

function selectReturning(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => rows }) }) };
}

vi.mock("@/lib/database/client", () => {
  const run = {
    id: "run_1",
    projectId: "project_1",
    connectionId: "connection_1",
    entryId: "entry_1",
    sourceLocale: "en",
    targetLocales: ["fr"],
    runQa: false,
    writeDrafts: false,
    overwriteDraftLocales: false,
  };
  const select = vi
    .fn()
    .mockImplementationOnce(() => selectReturning([run]))
    .mockImplementation(() => selectReturning([]));
  const update = () => ({ set: () => ({ where: async () => undefined }) });
  return {
    db: { select, update },
    schema: { contentfulTranslationRuns: {}, workspaceAutomationRuns: {} },
  };
});
vi.mock("ai", () => ({ ToolLoopAgent: toolLoopAgentCtor, isStepCount: vi.fn() }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  extractGenerateResultTokenUsage: vi.fn(),
  withAgentRuntimeUsageMetering: meteringMock,
}));
vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: resolveHyperlocaliseAgentLanguageModelMock,
}));
vi.mock("@/lib/translation/generation", () => ({
  loadOrganizationTranslationGenerator: vi.fn(async () => ({
    ok: true,
    project: { name: "Project", translationContext: "" },
    translateStringJob: vi.fn(),
  })),
}));
vi.mock("@/agents/automations/workspace/agent/workspace-template-manifest", () => ({
  composeContentfulAutomationInstructions: vi.fn(() => "instructions"),
}));
vi.mock("./context", () => ({ createContentfulAgentSession: vi.fn(() => ({})) }));
vi.mock("./tools/build-contentful-tools", () => ({
  buildContentfulAgentTools: vi.fn(() => ({})),
  CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME: "run_translation",
  loadContentfulAgentClient: vi.fn(async () => ({ client: {}, connection: { fieldConfig: {} } })),
}));

import { runContentfulAgent } from "./run-contentful-agent";

const event = {
  organizationId: "org_1",
  contentfulTranslationRunId: "run_1",
  workspaceAutomationRunId: "workspace_run_1",
};

describe("runContentfulAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the agent on the workspace's own model and meters it as own-key use", async () => {
    const ownModel = { modelId: "claude-sonnet-5" };
    resolveHyperlocaliseAgentLanguageModelMock.mockResolvedValueOnce({
      model: ownModel,
      source: "anthropic",
      modelId: "anthropic/claude-sonnet-5",
    });

    await runContentfulAgent(event as never, { manageWorkspaceRunStatus: false });

    expect(resolveHyperlocaliseAgentLanguageModelMock).toHaveBeenCalledWith({
      organizationId: "org_1",
    });
    expect(toolLoopAgentCtor).toHaveBeenCalledWith(expect.objectContaining({ model: ownModel }));
    expect(meteringMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aiCreditModelId: "anthropic/claude-sonnet-5",
        aiCreditCredentialSource: "byok",
      }),
    );
  });
});
