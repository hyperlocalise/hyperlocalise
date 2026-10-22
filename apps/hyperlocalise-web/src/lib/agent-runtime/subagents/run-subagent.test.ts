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

const { repositoryGenerateMock, resolveModelMock, trackAiCallTokenUsageMock } = vi.hoisted(() => ({
  repositoryGenerateMock: vi.fn(),
  resolveModelMock: vi.fn(),
  trackAiCallTokenUsageMock: vi.fn(),
}));

vi.mock("./repository", () => ({ repositorySubagent: { generate: repositoryGenerateMock } }));
vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: resolveModelMock,
}));
vi.mock("@/lib/billing/agent-runtime-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/agent-runtime-usage")>();
  return { ...actual, trackAiCallTokenUsage: trackAiCallTokenUsageMock };
});

import { runSubagent } from "./run-subagent";

const options = {
  toolContext: { organizationId: "org_1" },
  task: "Find context",
  instructions: "Search the repository.",
} as never;
const usage = { inputTokens: 40_000, outputTokens: 900, totalTokens: 40_900 };

describe("runSubagent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the agent on the looked-up model and bills the run by it", async () => {
    const languageModel = {
      model: "openai/gpt-6-luna",
      modelId: "openai/gpt-6-luna",
      source: "gateway",
    };
    resolveModelMock.mockResolvedValue(languageModel);
    repositoryGenerateMock.mockResolvedValue({ text: "Found it in src/app.tsx:12.", usage });

    const result = await runSubagent("repository", options, {
      usageSource: "project_file_string_context_lookup",
    });

    expect(result).toEqual({ text: "Found it in src/app.tsx:12." });
    expect(resolveModelMock).toHaveBeenCalledTimes(1);
    expect(repositoryGenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ languageModel }) }),
    );
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      source: "project_file_string_context_lookup",
      tokenUsage: usage,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });
  });

  it("records a run on the workspace's own key at no charge, under the lookup's model name", async () => {
    resolveModelMock.mockResolvedValue({
      model: {},
      modelId: "google/gemini-2.5-flash",
      source: "gemini",
    });
    repositoryGenerateMock.mockResolvedValue({ text: "Found it.", usage });

    await runSubagent("repository", options, { usageSource: "project_file_string_context_lookup" });

    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "google/gemini-2.5-flash", credentialSource: "byok" }),
    );
  });

  it("records nothing when the run fails", async () => {
    resolveModelMock.mockResolvedValue({ model: "m", modelId: "m", source: "gateway" });
    repositoryGenerateMock.mockRejectedValue(new Error("sandbox stopped"));

    await expect(
      runSubagent("repository", options, { usageSource: "project_file_string_context_lookup" }),
    ).rejects.toThrow("sandbox stopped");
    expect(trackAiCallTokenUsageMock).not.toHaveBeenCalled();
  });
});
