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

const { repositoryGenerateMock, trackAiCallTokenUsageMock } = vi.hoisted(() => ({
  repositoryGenerateMock: vi.fn(),
  trackAiCallTokenUsageMock: vi.fn(),
}));

vi.mock("./repository", () => ({ repositorySubagent: { generate: repositoryGenerateMock } }));
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

describe("runSubagent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the whole run's tokens under the caller's source", async () => {
    repositoryGenerateMock.mockResolvedValue({
      text: "Found it in src/app.tsx:12.",
      usage: { inputTokens: 40_000, outputTokens: 900, totalTokens: 40_900 },
    });

    const result = await runSubagent("repository", options, {
      usageSource: "project_file_string_context_lookup",
    });

    expect(result).toEqual({ text: "Found it in src/app.tsx:12." });
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      source: "project_file_string_context_lookup",
      tokenUsage: { inputTokens: 40_000, outputTokens: 900, totalTokens: 40_900 },
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });
  });

  it("records nothing when the run fails", async () => {
    repositoryGenerateMock.mockRejectedValue(new Error("sandbox stopped"));

    await expect(
      runSubagent("repository", options, { usageSource: "chat_repository_subagent" }),
    ).rejects.toThrow("sandbox stopped");
    expect(trackAiCallTokenUsageMock).not.toHaveBeenCalled();
  });
});
