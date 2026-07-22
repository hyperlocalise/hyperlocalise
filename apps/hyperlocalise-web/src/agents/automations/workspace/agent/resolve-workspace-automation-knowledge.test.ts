/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getKnowledgeMemoryForOrganizationMock = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/hyperlocalise_test";
  process.env.PROVIDER_CREDENTIALS_MASTER_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  return vi.fn();
});
const selectKnowledgeMemoryContextMock = vi.hoisted(() => vi.fn());

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

vi.mock("@/lib/knowledge-memory/knowledge-memory", () => ({
  getKnowledgeMemoryForOrganization: getKnowledgeMemoryForOrganizationMock,
}));

vi.mock("@/lib/knowledge-memory/knowledge-memory-selection", () => ({
  selectKnowledgeMemoryContext: selectKnowledgeMemoryContextMock,
}));

import { resolveWorkspaceAutomationKnowledgeContext } from "./resolve-workspace-automation-knowledge";

function automation(
  toolConfig: WorkspaceAutomationRecord["toolConfig"],
): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Nightly sync",
    instructions: "Keep product names consistent.",
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig,
    configVersion: 1,
    nextRunAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveWorkspaceAutomationKnowledgeContext", () => {
  beforeEach(() => {
    getKnowledgeMemoryForOrganizationMock.mockReset();
    selectKnowledgeMemoryContextMock.mockReset();
  });

  it("returns null when knowledge tool is disabled", async () => {
    await expect(
      resolveWorkspaceAutomationKnowledgeContext({
        organizationId: "org-1",
        automation: automation({}),
      }),
    ).resolves.toBeNull();
    expect(getKnowledgeMemoryForOrganizationMock).not.toHaveBeenCalled();
  });

  it("returns selected knowledge when the tool is enabled", async () => {
    getKnowledgeMemoryForOrganizationMock.mockResolvedValue({
      content: "# Style\nUse sentence case.",
      updatedAt: null,
      updatedByUserId: null,
    });
    selectKnowledgeMemoryContextMock.mockReturnValue({
      compactText: "Use sentence case.",
      segments: [],
      metrics: {
        selectedMemoryCount: 1,
        selectedMemoryChars: 18,
        wholeMemoryChars: 24,
        reductionPercent: 25,
        matchedHeadingPaths: [],
        fallbackMode: "selective",
      },
    });

    await expect(
      resolveWorkspaceAutomationKnowledgeContext({
        organizationId: "org-1",
        automation: automation({ knowledge: { enabled: true } }),
      }),
    ).resolves.toBe("Use sentence case.");

    expect(selectKnowledgeMemoryContextMock).toHaveBeenCalledWith({
      content: "# Style\nUse sentence case.",
      sourceText: "Keep product names consistent.",
      context: "Nightly sync",
    });
  });
});
