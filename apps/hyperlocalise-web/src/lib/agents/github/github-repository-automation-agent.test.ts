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

const { resolveHyperlocaliseAgentLanguageModelMock, toolLoopAgentCtor, meteringMock } = vi.hoisted(
  () => {
    const generateMock = vi.fn(async () => ({ text: "review" }));
    return {
      resolveHyperlocaliseAgentLanguageModelMock: vi.fn(),
      toolLoopAgentCtor: vi.fn(function ToolLoopAgent(_options: unknown) {
        return { generate: generateMock };
      }),
      meteringMock: vi.fn(async (input: { run: () => Promise<unknown> }) => input.run()),
    };
  },
);

vi.mock("ai", () => ({ ToolLoopAgent: toolLoopAgentCtor }));
vi.mock("@/lib/agent-runtime/tools/registry", () => ({ buildTools: vi.fn(() => ({})) }));
vi.mock("@/agents/_runtime/compose-instructions", () => ({
  composeInstructions: vi.fn(() => "instructions"),
}));
vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: resolveHyperlocaliseAgentLanguageModelMock,
}));
vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  extractGenerateResultTokenUsage: vi.fn(() => null),
  withAgentRuntimeUsageMetering: meteringMock,
}));

import {
  runGithubPullRequestReviewAgent,
  runRepositoryLocalisationAgentForCommit,
} from "./github-repository-automation-agent";

const ownModel = { modelId: "claude-sonnet-5" };

describe("GitHub repository automation agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveHyperlocaliseAgentLanguageModelMock.mockResolvedValue({
      model: ownModel,
      source: "anthropic",
      modelId: "anthropic/claude-sonnet-5",
    });
  });

  it("reviews a commit on the workspace's own model and meters it as own-key use", async () => {
    await runRepositoryLocalisationAgentForCommit({
      organizationId: "org_1",
      sandboxId: "sbx_1",
      commitSha: "abc",
      parentCommitSha: null,
      changedPaths: [],
      diffExcerpt: "",
    });

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

  it("meters a pull request review on our model as gateway use", async () => {
    resolveHyperlocaliseAgentLanguageModelMock.mockResolvedValueOnce({
      model: "openai/gpt-6-luna",
      source: "gateway",
      modelId: "openai/gpt-6-luna",
    });

    await runGithubPullRequestReviewAgent({
      organizationId: "org_1",
      sandboxId: "sbx_1",
      pullRequestNumber: 7,
      headSha: "def",
      baseSha: null,
      changedPaths: [],
      diffExcerpt: "",
      additionalPrompt: "",
    });

    expect(meteringMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aiCreditModelId: "openai/gpt-6-luna",
        aiCreditCredentialSource: "gateway",
      }),
    );
  });
});
