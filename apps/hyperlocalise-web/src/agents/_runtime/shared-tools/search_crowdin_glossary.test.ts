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

import { ok } from "@/lib/primitives/result/results";

import { createSearchCrowdinGlossaryTool } from "./search_crowdin_glossary";

const { searchGlossaryForAgentMock } = vi.hoisted(() => ({
  searchGlossaryForAgentMock: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-provider", () => ({
  crowdinTmsProvider: {
    searchGlossaryForAgent: (...args: unknown[]) => searchGlossaryForAgentMock(...args),
  },
}));

describe("createSearchCrowdinGlossaryTool", () => {
  beforeEach(() => {
    searchGlossaryForAgentMock.mockReset();
  });

  it("keeps search organization-scoped when neither input nor context has projectId", async () => {
    searchGlossaryForAgentMock.mockResolvedValue(
      ok({ scope: "organization", crowdinProjectId: null, matches: [] }),
    );
    const tool = createSearchCrowdinGlossaryTool({
      organizationId: "org-1",
      localUserId: "user-1",
      projectId: null,
      glossarySearchEnabled: true,
    });

    await tool.execute?.(
      {
        expressions: ["Talk to Heidi"],
        sourceLocale: "en",
        targetLocale: "vi",
        limit: 20,
      },
      {} as never,
    );

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
    const tool = createSearchCrowdinGlossaryTool({
      organizationId: "org-1",
      localUserId: "user-1",
      projectId: "project-1",
      glossarySearchEnabled: true,
    });

    await tool.execute?.(
      {
        expressions: ["Talk to Heidi"],
        sourceLocale: "en",
        targetLocale: "vi",
        limit: 20,
      },
      {} as never,
    );

    expect(searchGlossaryForAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        projectId: "project-1",
      }),
    );
  });

  it("fails closed when glossary search is disabled", async () => {
    const tool = createSearchCrowdinGlossaryTool({
      organizationId: "org-1",
      localUserId: "user-1",
      projectId: null,
      glossarySearchEnabled: false,
    });

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
