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

import { createCheckCrowdinProgressTool } from "./check_crowdin_progress";
import { createTranslateStringTool } from "./translate_string";

const mocks = vi.hoisted(() => ({
  canAccessProject: vi.fn(),
  loadGenerator: vi.fn(),
  checkProgress: vi.fn(),
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolCanAccessProject: (...args: unknown[]) => mocks.canAccessProject(...args),
}));
vi.mock("@/lib/translation/generation", () => ({
  loadOrganizationTranslationGenerator: (...args: unknown[]) => mocks.loadGenerator(...args),
}));
vi.mock("@/lib/providers/adapters/crowdin/crowdin-provider", () => ({
  crowdinTmsProvider: { checkProgress: (...args: unknown[]) => mocks.checkProgress(...args) },
}));

const ctx = {
  conversationId: "conversation-1",
  organizationId: "org-a",
  localUserId: "user-a",
  membershipRole: "member",
  projectId: "project-a",
  db: {} as never,
} satisfies ToolContext;

describe("project-scoped agent tools", () => {
  beforeEach(() => {
    mocks.canAccessProject.mockReset();
    mocks.loadGenerator.mockReset();
    mocks.checkProgress.mockReset();
  });

  it("rejects an inaccessible translate_string override before loading a model", async () => {
    mocks.canAccessProject.mockResolvedValue(null);
    const tool = createTranslateStringTool(ctx);

    await expect(
      tool.execute?.(
        { projectId: "project-b", sourceText: "Secret", targetLocales: ["fr"] },
        {} as never,
      ),
    ).rejects.toThrow("Project not found or not accessible.");
    expect(mocks.canAccessProject).toHaveBeenCalledWith(ctx, "project-b");
    expect(mocks.loadGenerator).not.toHaveBeenCalled();
  });

  it("rejects an inaccessible Crowdin project before querying progress", async () => {
    mocks.canAccessProject.mockResolvedValue(null);
    const tool = createCheckCrowdinProgressTool(ctx);

    await expect(
      tool.execute?.({ projectId: "project-b", scope: "string", stringId: 42 }, {} as never),
    ).resolves.toEqual({ success: false, error: "Project not found or not accessible." });
    expect(mocks.canAccessProject).toHaveBeenCalledWith(ctx, "project-b");
    expect(mocks.checkProgress).not.toHaveBeenCalled();
  });
});
