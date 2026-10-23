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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { autumnCheckMock, organizationHasOwnModelKeyMock } = vi.hoisted(() => ({
  autumnCheckMock: vi.fn(),
  organizationHasOwnModelKeyMock: vi.fn(),
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

vi.mock("@/lib/providers/organization-language-model", () => ({
  organizationHasOwnModelKey: organizationHasOwnModelKeyMock,
}));

import {
  AI_CREDIT_EXHAUSTED_CODE,
  AI_CREDIT_EXHAUSTED_MESSAGE,
  AI_FEATURES_CHECK_FAILED_CODE,
  AI_FEATURES_REQUIRED_CODE,
  AI_FEATURES_REQUIRED_MESSAGE,
  ensureAiFeaturesAllowed,
  formatAiFeaturesRefusal,
} from "./ai-features";

function mockAutumnChecks(allowed: { aiFeatures: boolean; aiCredit: boolean }) {
  autumnCheckMock.mockImplementation(async (params: { featureId: string }) => ({
    allowed: params.featureId === "ai_tokens" ? allowed.aiCredit : allowed.aiFeatures,
  }));
}

describe("ensureAiFeaturesAllowed", () => {
  beforeEach(() => {
    organizationHasOwnModelKeyMock.mockResolvedValue(false);
  });

  afterEach(() => {
    autumnCheckMock.mockReset();
    organizationHasOwnModelKeyMock.mockReset();
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

  it("allows when Autumn reports the feature is enabled and AI credit is left", async () => {
    mockAutumnChecks({ aiFeatures: true, aiCredit: true });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result.ok).toBe(true);
    expect(autumnCheckMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: "ai_features",
    });
    expect(autumnCheckMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: "ai_tokens",
      requiredBalance: 0.01,
    });
  });

  it("denies when the AI credit is used up", async () => {
    mockAutumnChecks({ aiFeatures: true, aiCredit: false });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AI_CREDIT_EXHAUSTED_CODE, message: AI_CREDIT_EXHAUSTED_MESSAGE },
    });
    expect(organizationHasOwnModelKeyMock).toHaveBeenCalledWith("org_123");
  });

  it("skips the AI credit check when the workspace has its own model key", async () => {
    organizationHasOwnModelKeyMock.mockResolvedValue(true);
    mockAutumnChecks({ aiFeatures: true, aiCredit: false });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result.ok).toBe(true);
    expect(autumnCheckMock).toHaveBeenCalledTimes(1);
    expect(autumnCheckMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: "ai_features",
    });
  });

  it("reports the plan before the AI credit when both deny", async () => {
    mockAutumnChecks({ aiFeatures: false, aiCredit: false });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AI_FEATURES_REQUIRED_CODE },
    });
  });

  it("denies when Autumn reports the feature is disabled", async () => {
    mockAutumnChecks({ aiFeatures: false, aiCredit: true });

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

  it("fails closed when only the AI credit check throws", async () => {
    autumnCheckMock.mockImplementation(async (params: { featureId: string }) => {
      if (params.featureId === "ai_tokens") {
        throw new Error("Request timed out");
      }
      return { allowed: true };
    });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AI_FEATURES_CHECK_FAILED_CODE, message: "Request timed out" },
    });
  });

  it("fails closed when the own-key lookup throws, without the database's message", async () => {
    organizationHasOwnModelKeyMock.mockRejectedValue(new Error("database unavailable"));
    mockAutumnChecks({ aiFeatures: true, aiCredit: true });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: AI_FEATURES_CHECK_FAILED_CODE, message: "Unable to verify AI credit." },
    });
  });

  it("reports a plan without AI even when the credit check fails", async () => {
    autumnCheckMock.mockImplementation(async (params: { featureId: string }) => {
      if (params.featureId === "ai_tokens") {
        throw new Error("Request timed out");
      }
      return { allowed: false };
    });

    const result = await ensureAiFeaturesAllowed({
      organizationId: "org_123",
      autumnApiKey: "am_sk_test",
    });

    expect(result).toMatchObject({ ok: false, error: { code: AI_FEATURES_REQUIRED_CODE } });
  });
});

describe("formatAiFeaturesRefusal", () => {
  it("names the used-up AI credit", () => {
    expect(formatAiFeaturesRefusal({ code: AI_CREDIT_EXHAUSTED_CODE, message: "ignored" })).toBe(
      AI_CREDIT_EXHAUSTED_MESSAGE,
    );
  });

  it("keeps the plan wording for other refusals", () => {
    expect(
      formatAiFeaturesRefusal({ code: AI_FEATURES_CHECK_FAILED_CODE, message: "timeout" }),
    ).toBe(AI_FEATURES_REQUIRED_MESSAGE);
  });
});
