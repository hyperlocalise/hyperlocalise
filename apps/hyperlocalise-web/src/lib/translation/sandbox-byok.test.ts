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

const { loadLatestOrganizationProviderCredentialMock, selectMock } = vi.hoisted(() => ({
  loadLatestOrganizationProviderCredentialMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@/lib/providers/organization-language-model", () => ({
  loadLatestOrganizationProviderCredential: loadLatestOrganizationProviderCredentialMock,
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
  schema: {
    jobs: {
      id: "jobs.id",
      organizationId: "jobs.organization_id",
    },
  },
}));

import { loadSandboxByokCredential, loadSandboxByokCredentialForJob } from "./sandbox-byok";

describe("loadSandboxByokCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the organization credential when BYOK is configured", async () => {
    loadLatestOrganizationProviderCredentialMock.mockResolvedValueOnce({
      ok: true,
      credential: {
        provider: "anthropic",
        apiKey: "sk-ant-org",
        model: "claude-sonnet-4-6",
      },
    });

    await expect(loadSandboxByokCredential("org_123")).resolves.toEqual({
      provider: "anthropic",
      apiKey: "sk-ant-org",
      model: "claude-sonnet-4-6",
    });
  });

  it("returns null when the organization has no stored credential", async () => {
    loadLatestOrganizationProviderCredentialMock.mockResolvedValueOnce({
      ok: true,
      credential: null,
    });

    await expect(loadSandboxByokCredential("org_123")).resolves.toBeNull();
  });

  it("throws when the stored credential is invalid", async () => {
    loadLatestOrganizationProviderCredentialMock.mockResolvedValueOnce({
      ok: false,
      code: "provider_credential_invalid",
      message: "organization provider credential is incomplete",
    });

    await expect(loadSandboxByokCredential("org_123")).rejects.toThrow(
      "organization provider credential is incomplete",
    );
  });
});

describe("loadSandboxByokCredentialForJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads BYOK from the job organization", async () => {
    selectMock.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ organizationId: "org_123" }],
        }),
      }),
    });
    loadLatestOrganizationProviderCredentialMock.mockResolvedValueOnce({
      ok: true,
      credential: {
        provider: "openai",
        apiKey: "sk-org",
        model: "gpt-5.6-luna",
      },
    });

    await expect(loadSandboxByokCredentialForJob("job_123")).resolves.toEqual({
      provider: "openai",
      apiKey: "sk-org",
      model: "gpt-5.6-luna",
    });
  });

  it("returns null when the job has no organization", async () => {
    selectMock.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ organizationId: null }],
        }),
      }),
    });

    await expect(loadSandboxByokCredentialForJob("job_123")).resolves.toBeNull();
    expect(loadLatestOrganizationProviderCredentialMock).not.toHaveBeenCalled();
  });
});
