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

const { workspaceGlossarySearchFlagRunMock } = vi.hoisted(() => ({
  workspaceGlossarySearchFlagRunMock: vi.fn(),
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  workspaceGlossarySearchFlag: { run: workspaceGlossarySearchFlagRunMock },
}));

import { resolveChatGlossarySearchCapability } from "./chat-glossary-search-capability";

const auth = {
  organization: { workosOrganizationId: "org_workos_123" },
  user: { workosUserId: "user_workos_123" },
} as never;

describe("resolveChatGlossarySearchCapability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true only when the organization flag resolves to true", async () => {
    workspaceGlossarySearchFlagRunMock.mockResolvedValue(true);

    await expect(resolveChatGlossarySearchCapability(auth)).resolves.toBe(true);

    const identify = workspaceGlossarySearchFlagRunMock.mock.calls[0]?.[0].identify;
    expect(identify()).toEqual({
      organization: { id: "org_workos_123" },
      user: { id: "user_workos_123" },
    });
  });

  it.each([false, undefined, null])("fails closed for a %s result", async (result) => {
    workspaceGlossarySearchFlagRunMock.mockResolvedValue(result);

    await expect(resolveChatGlossarySearchCapability(auth)).resolves.toBe(false);
  });

  it("fails closed when flag evaluation throws", async () => {
    workspaceGlossarySearchFlagRunMock.mockRejectedValue(new Error("flag unavailable"));

    await expect(resolveChatGlossarySearchCapability(auth)).resolves.toBe(false);
  });
});
