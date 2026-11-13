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
import { describe, expect, it, vi } from "vite-plus/test";

const { resolveHyperlocaliseAgentLanguageModelMock, toolLoopAgentCtor } = vi.hoisted(() => ({
  resolveHyperlocaliseAgentLanguageModelMock: vi.fn(),
  toolLoopAgentCtor: vi.fn(function ToolLoopAgent(this: { settings: unknown }, settings: unknown) {
    this.settings = settings;
  }),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  ToolLoopAgent: toolLoopAgentCtor,
}));
vi.mock("@/lib/agent-runtime/subagents/build-subagent-tools", () => ({
  buildSubagentToolSet: vi.fn(() => ({ grep: {} })),
}));
vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: resolveHyperlocaliseAgentLanguageModelMock,
}));

import { repositorySubagent } from "./agent";

type PrepareCall = (input: {
  options: { toolContext: { organizationId: string }; task: string; instructions: string };
}) => Promise<{ model: unknown }>;

describe("repositorySubagent", () => {
  it("runs on the calling workspace's model", async () => {
    const ownModel = { modelId: "claude-sonnet-5" };
    resolveHyperlocaliseAgentLanguageModelMock.mockResolvedValueOnce({
      model: ownModel,
      source: "anthropic",
      modelId: "anthropic/claude-sonnet-5",
    });
    const { prepareCall } = (
      repositorySubagent as unknown as { settings: { prepareCall: PrepareCall } }
    ).settings;

    const call = await prepareCall({
      options: { toolContext: { organizationId: "org_1" }, task: "find", instructions: "look" },
    });

    expect(resolveHyperlocaliseAgentLanguageModelMock).toHaveBeenCalledWith({
      organizationId: "org_1",
    });
    expect(call.model).toBe(ownModel);
  });
});
