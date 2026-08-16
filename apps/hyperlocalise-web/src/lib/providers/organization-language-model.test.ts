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

const {
  selectMock,
  decryptProviderCredentialMock,
  getManagedLanguageModelMock,
  resolveProviderLanguageModelMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  decryptProviderCredentialMock: vi.fn(),
  getManagedLanguageModelMock: vi.fn(() => ({ kind: "gateway", modelId: "openai/gpt-5.6-luna" })),
  resolveProviderLanguageModelMock: vi.fn(
    (input: { provider: string; apiKey: string; model: string }) => ({
      kind: input.provider,
      modelId: input.model,
      apiKey: input.apiKey,
    }),
  ),
}));

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgresql://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise",
    PROVIDER_CREDENTIALS_MASTER_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    NEXT_PUBLIC_WAITLIST_URL: "https://example.com/waitlist",
  },
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: selectMock,
          }),
        }),
      }),
    }),
  },
  schema: {
    organizationLlmProviderCredentials: {
      provider: "provider",
      defaultModel: "defaultModel",
      encryptionAlgorithm: "encryptionAlgorithm",
      ciphertext: "ciphertext",
      iv: "iv",
      authTag: "authTag",
      keyVersion: "keyVersion",
      organizationId: "organizationId",
      updatedAt: "updatedAt",
    },
  },
}));

vi.mock("@/lib/security/provider-credential-crypto", () => ({
  decryptProviderCredential: decryptProviderCredentialMock,
  unwrapProviderCredentialCrypto: (value: unknown) => value,
}));

vi.mock("@/lib/providers/language-model", () => ({
  getManagedLanguageModel: getManagedLanguageModelMock,
  hyperlocaliseManagedGatewayModelId: "openai/gpt-5.6-luna",
  resolveProviderLanguageModel: resolveProviderLanguageModelMock,
}));

import { resolveHyperlocaliseAgentLanguageModel } from "./organization-language-model";

describe("resolveHyperlocaliseAgentLanguageModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to Gateway when the organization has no BYOK credential", async () => {
    selectMock.mockResolvedValue([]);

    await expect(
      resolveHyperlocaliseAgentLanguageModel({ organizationId: "org_1" }),
    ).resolves.toEqual({
      model: { kind: "gateway", modelId: "openai/gpt-5.6-luna" },
      source: "gateway",
      modelId: "openai/gpt-5.6-luna",
    });
  });

  it("uses the respective AI SDK client when the organization brings a key", async () => {
    selectMock.mockResolvedValue([
      {
        provider: "anthropic",
        defaultModel: "claude-sonnet-4-6",
        encryptionAlgorithm: "aes-256-gcm",
        ciphertext: "cipher",
        iv: "iv",
        authTag: "tag",
        keyVersion: 1,
      },
    ]);
    decryptProviderCredentialMock.mockReturnValue("sk-ant");

    await expect(
      resolveHyperlocaliseAgentLanguageModel({ organizationId: "org_1" }),
    ).resolves.toEqual({
      model: {
        kind: "anthropic",
        modelId: "claude-sonnet-4-6",
        apiKey: "sk-ant",
      },
      source: "anthropic",
      modelId: "claude-sonnet-4-6",
    });
    expect(getManagedLanguageModelMock).not.toHaveBeenCalled();
    expect(resolveProviderLanguageModelMock).toHaveBeenCalledWith({
      provider: "anthropic",
      apiKey: "sk-ant",
      model: "claude-sonnet-4-6",
    });
  });
});
