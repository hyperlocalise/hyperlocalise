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

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { ok } from "@/lib/primitives/result/results";

import { createSearchCrowdinGlossaryTool } from "./search_crowdin_glossary";

const { searchGlossaryForAgentMock, toolCanAccessProjectMock } = vi.hoisted(() => ({
  searchGlossaryForAgentMock: vi.fn(),
  toolCanAccessProjectMock: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-provider", () => ({
  crowdinTmsProvider: {
    searchGlossaryForAgent: (...args: unknown[]) => searchGlossaryForAgentMock(...args),
  },
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolCanAccessProject: (...args: unknown[]) => toolCanAccessProjectMock(...args),
}));

function createToolContext(
  overrides: Partial<Pick<ToolContext, "projectId" | "glossarySearchEnabled">> = {},
): ToolContext {
  return {
    conversationId: "conv-1",
    organizationId: "org-1",
    localUserId: "user-1",
    membershipRole: "member",
    projectId: null,
    db: {} as never,
    glossarySearchEnabled: true,
    ...overrides,
  };
}

describe("createSearchCrowdinGlossaryTool", () => {
  beforeEach(() => {
    searchGlossaryForAgentMock.mockReset();
    toolCanAccessProjectMock.mockReset();
    toolCanAccessProjectMock.mockResolvedValue({ id: "project-1" });
  });

  it("keeps search organization-scoped when neither input nor context has projectId", async () => {
    searchGlossaryForAgentMock.mockResolvedValue(
      ok({ scope: "organization", crowdinProjectId: null, matches: [] }),
    );
    const tool = createSearchCrowdinGlossaryTool(createToolContext());

    await tool.execute?.(
      {
        expressions: ["Talk to Heidi"],
        sourceLocale: "en",
        targetLocale: "vi",
        limit: 20,
      },
      {} as never,
    );

    expect(toolCanAccessProjectMock).not.toHaveBeenCalled();
    expect(searchGlossaryForAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        projectId: undefined,
      }),
    );
  });

  it("falls back to conversation projectId when input omits it", async () => {
    searchGlossaryForAgentMock.mockResolvedValue(
      ok({ scope: "project", crowdinProjectId: 42, matches: [] }),
    );
    const tool = createSearchCrowdinGlossaryTool(createToolContext({ projectId: "project-1" }));

    await tool.execute?.(
      {
        expressions: ["Talk to Heidi"],
        sourceLocale: "en",
        targetLocale: "vi",
        limit: 20,
      },
      {} as never,
    );

    expect(toolCanAccessProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "project-1",
    );
    expect(searchGlossaryForAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        projectId: "project-1",
      }),
    );
  });

  it("rejects project-scoped search when the caller cannot access the project", async () => {
    toolCanAccessProjectMock.mockResolvedValue(null);
    const tool = createSearchCrowdinGlossaryTool(
      createToolContext({ projectId: "project-forbidden" }),
    );

    await expect(
      tool.execute?.(
        {
          expressions: ["Talk to Heidi"],
          sourceLocale: "en",
          targetLocale: "vi",
          limit: 20,
        },
        {} as never,
      ),
    ).resolves.toEqual({
      success: false,
      error: "Project not found or not accessible.",
    });
    expect(searchGlossaryForAgentMock).not.toHaveBeenCalled();
  });

  it("fails closed when glossary search is disabled", async () => {
    const tool = createSearchCrowdinGlossaryTool(
      createToolContext({ glossarySearchEnabled: false }),
    );

    await expect(
      tool.execute?.(
        {
          expressions: ["Talk to Heidi"],
          sourceLocale: "en",
          targetLocale: "vi",
          limit: 20,
        },
        {} as never,
      ),
    ).resolves.toEqual({
      success: false,
      error: "Glossary search is not enabled for this workspace.",
    });
    expect(searchGlossaryForAgentMock).not.toHaveBeenCalled();
  });
});
