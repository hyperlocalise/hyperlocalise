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

const { loadGeneratorMock, translateStringJobMock, trackAiCallTokenUsageMock } = vi.hoisted(() => ({
  loadGeneratorMock: vi.fn(),
  translateStringJobMock: vi.fn(),
  trackAiCallTokenUsageMock: vi.fn(),
}));

vi.mock("@/lib/translation/generation", () => ({
  loadOrganizationTranslationGenerator: loadGeneratorMock,
}));
vi.mock("@/lib/translation/context", () => ({
  assembleStringTranslationContextSnapshot: vi.fn().mockResolvedValue({ ok: false }),
}));
vi.mock("@/agents/_runtime/loader", () => ({ loadSharedSkill: () => "" }));
vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  trackAiCallTokenUsage: trackAiCallTokenUsageMock,
}));

import { executeTranslateString } from "./translate_string";

describe("executeTranslateString", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadGeneratorMock.mockResolvedValue({
      ok: true,
      project: { name: "Docs", translationContext: "" },
      translateStringJob: translateStringJobMock,
    });
  });

  it("records the translation's tokens against the model that made it", async () => {
    const tokenUsage = {
      inputTokens: 300,
      outputTokens: 40,
      totalTokens: 340,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway" as const,
    };
    translateStringJobMock.mockResolvedValue({
      translations: [{ locale: "fr", text: "Bonjour" }],
      tokenUsage,
    });

    const result = await executeTranslateString(
      { sourceText: "Hello", targetLocales: ["fr"], projectId: "proj_1" },
      "org_1",
    );

    expect(result).toEqual({ translations: [{ locale: "fr", text: "Bonjour" }] });
    expect(trackAiCallTokenUsageMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      source: "chat_translate_string",
      tokenUsage,
      modelId: "openai/gpt-6-luna",
      credentialSource: "gateway",
    });
  });
});
