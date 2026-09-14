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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const checkMock = vi.hoisted(() => vi.fn());

vi.mock("autumn-js", () => ({
  Autumn: vi.fn(function AutumnMock() {
    return { check: checkMock };
  }),
}));

import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { isAutumnBooleanFeatureEnabled } from "@/lib/billing/autumn-boolean-feature-access";

describe("isAutumnBooleanFeatureEnabled", () => {
  afterEach(() => {
    checkMock.mockReset();
  });

  it("returns true in tests when autumnApiKey is omitted", async () => {
    await expect(
      isAutumnBooleanFeatureEnabled({
        organizationId: "org_1",
        featureId: autumnFeatureIds.queriesBoard,
      }),
    ).resolves.toBe(true);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("returns false when Autumn denies the feature", async () => {
    checkMock.mockResolvedValue({ allowed: false });

    await expect(
      isAutumnBooleanFeatureEnabled({
        organizationId: "org_1",
        featureId: autumnFeatureIds.automationWorkflow,
        autumnApiKey: "am_sk_test",
      }),
    ).resolves.toBe(false);
  });

  it("returns true when Autumn allows the feature", async () => {
    checkMock.mockResolvedValue({ allowed: true });

    await expect(
      isAutumnBooleanFeatureEnabled({
        organizationId: "org_1",
        featureId: autumnFeatureIds.automationWorkflow,
        autumnApiKey: "am_sk_test",
      }),
    ).resolves.toBe(true);

    expect(checkMock).toHaveBeenCalledWith({
      customerId: "org_1",
      featureId: autumnFeatureIds.automationWorkflow,
    });
  });
});
