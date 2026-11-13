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

const { isAutumnBooleanFeatureEnabledMock } = vi.hoisted(() => ({
  isAutumnBooleanFeatureEnabledMock: vi.fn(),
}));

vi.mock("@/lib/billing/autumn-boolean-feature-access", () => ({
  isAutumnBooleanFeatureEnabled: isAutumnBooleanFeatureEnabledMock,
}));

import { resolveChatKnowledgeMemoryCapability } from "./chat-knowledge-memory-capability";

const auth = {
  organization: { localOrganizationId: "org_local_123", workosOrganizationId: "org_workos_123" },
  user: { workosUserId: "user_workos_123" },
} as never;

describe("resolveChatKnowledgeMemoryCapability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks the Autumn guidelines feature for the local organization", async () => {
    isAutumnBooleanFeatureEnabledMock.mockResolvedValue(true);

    await expect(resolveChatKnowledgeMemoryCapability(auth)).resolves.toBe(true);

    expect(isAutumnBooleanFeatureEnabledMock).toHaveBeenCalledWith({
      organizationId: "org_local_123",
      featureId: "guidelines",
    });
  });

  it("fails closed when Autumn denies the feature", async () => {
    isAutumnBooleanFeatureEnabledMock.mockResolvedValue(false);

    await expect(resolveChatKnowledgeMemoryCapability(auth)).resolves.toBe(false);
  });

  it("fails closed when the Autumn check throws", async () => {
    isAutumnBooleanFeatureEnabledMock.mockRejectedValue(new Error("autumn unavailable"));

    await expect(resolveChatKnowledgeMemoryCapability(auth)).resolves.toBe(false);
  });
});
