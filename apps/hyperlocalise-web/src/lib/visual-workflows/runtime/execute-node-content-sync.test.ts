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

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  selectRows: vi.fn(),
  executeContentSyncConfig: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: () => ({
          limit: mocks.selectLimit,
        }),
      })),
    })),
  },
  schema: {
    projects: {
      id: "id",
      organizationId: "organizationId",
    },
  },
}));

vi.mock("@/lib/agents/content-sync/execute-content-sync", () => ({
  executeContentSyncConfig: (...args: unknown[]) => mocks.executeContentSyncConfig(...args),
}));

import { ok } from "@/lib/primitives/result/results";

import { createVisualWorkflowExecutionContext } from "./context";
import { executeVisualWorkflowNode } from "./execute-node";

const organizationId = "00000000-0000-4000-8000-000000000001";
const projectId = "11111111-1111-4111-8111-111111111111";

function contentSyncNode(
  overrides: Partial<{
    projectId: string;
    connectionId: string;
    resourceKey: string;
    providerFolder: string;
    projectFolder: string;
  }> = {},
) {
  return {
    id: "sync",
    type: "action.content_sync" as const,
    config: {
      kind: "action.content_sync" as const,
      provider: "github" as const,
      projectId: overrides.projectId ?? projectId,
      connectionId: overrides.connectionId ?? "22222222-2222-4222-8222-222222222222",
      resourceKey: overrides.resourceKey ?? "acme/web",
      providerFolder: overrides.providerFolder ?? "locales",
      projectFolder: overrides.projectFolder ?? "github/acme/web",
      onError: "stop" as const,
    },
  };
}

describe("executeVisualWorkflowNode content sync", () => {
  beforeEach(() => {
    mocks.selectRows.mockReset();
    mocks.selectLimit.mockReset();
    mocks.executeContentSyncConfig.mockReset();
    mocks.selectLimit.mockImplementation(() => Promise.resolve(mocks.selectRows()));
  });

  it("rejects unsafe project folders before calling the provider", async () => {
    const context = createVisualWorkflowExecutionContext({ triggerInput: {} });
    const result = await executeVisualWorkflowNode({
      organizationId,
      context,
      node: contentSyncNode({ projectFolder: "../translations" }),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "content_sync_folder_invalid",
        message: "Choose a safe relative folder path.",
      },
    });
    expect(mocks.executeContentSyncConfig).not.toHaveBeenCalled();
    expect(mocks.selectLimit).not.toHaveBeenCalled();
  });

  it("rejects projects outside the run organization", async () => {
    mocks.selectRows.mockResolvedValue([]);

    const context = createVisualWorkflowExecutionContext({ triggerInput: {} });
    const result = await executeVisualWorkflowNode({
      organizationId,
      context,
      node: contentSyncNode(),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "project_not_found",
        message: "Choose a project in this organization.",
      },
    });
    expect(mocks.executeContentSyncConfig).not.toHaveBeenCalled();
  });

  it("runs content sync after config and project validation", async () => {
    mocks.selectRows.mockResolvedValue([{ id: projectId }]);
    mocks.executeContentSyncConfig.mockResolvedValue(
      ok({ pulled: { uploaded: 0, skipped: 0, failed: 0 }, pushed: { written: 0 } }),
    );

    const context = createVisualWorkflowExecutionContext({ triggerInput: {} });
    const result = await executeVisualWorkflowNode({
      organizationId,
      context,
      node: contentSyncNode(),
    });

    expect(result.ok).toBe(true);
    expect(mocks.executeContentSyncConfig).toHaveBeenCalledOnce();
  });
});
