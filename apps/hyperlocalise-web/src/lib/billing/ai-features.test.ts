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

const { autumnCheckMock } = vi.hoisted(() => ({
  autumnCheckMock: vi.fn(),
}));

vi.mock("autumn-js", () => ({
  Autumn: class Autumn {
    check(...args: unknown[]) {
      return autumnCheckMock(...args);
    }
  },
}));

vi.mock("@/lib/billing/autumn-config", () => ({
  getAutumnSecretKey: () => undefined,
}));

import {
  AI_FEATURES_CHECK_FAILED_CODE,
  AI_FEATURES_REQUIRED_CODE,
  ensureAiFeaturesAllowed,
} from "./ai-features";

describe("ensureAiFeaturesAllowed", () => {
  afterEach(() => {
    autumnCheckMock.mockReset();
  });

  it("allows in tests when no Autumn key is provided", async () => {
    const result = await ensureAiFeaturesAllowed({ organizationId: "org_123" });

    expect(result.ok).toBe(true);
    expect(autumnCheckMock).not.toHaveBeenCalled();
  });

  it("denies when the Autumn key is empty", async () => {
    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AI_FEATURES_REQUIRED_CODE },
    });
    expect(autumnCheckMock).not.toHaveBeenCalled();
  });

  it("allows when Autumn reports the feature is enabled", async () => {
    autumnCheckMock.mockResolvedValue({ allowed: true });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result.ok).toBe(true);
    expect(autumnCheckMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: "ai_features",
    });
  });

  it("denies when Autumn reports the feature is disabled", async () => {
    autumnCheckMock.mockResolvedValue({ allowed: false });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AI_FEATURES_REQUIRED_CODE },
    });
  });

  it("fails closed when Autumn throws", async () => {
    autumnCheckMock.mockRejectedValue(new Error("autumn unavailable"));

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: AI_FEATURES_CHECK_FAILED_CODE,
        message: "autumn unavailable",
      },
    });
  });
});
