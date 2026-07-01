import "dotenv/config";

import { describe, expect, it, vi } from "vite-plus/test";

import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

const getActiveCredentialMock = vi.fn();

vi.mock("@/lib/providers/organization-external-tms-provider-credentials", () => ({
  getActiveOrganizationExternalTmsProviderCredentialRow: (...args: unknown[]) =>
    getActiveCredentialMock(...args),
}));

vi.mock("@/lib/security/provider-credential-crypto", () => ({
  decryptProviderCredential: vi.fn(),
  unwrapProviderCredentialCrypto: vi.fn((value: unknown) => value),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
  schema: {
    projects: {
      externalProjectId: "external_project_id",
      externalProviderCredentialId: "external_provider_credential_id",
      externalProviderKind: "external_provider_kind",
      id: "id",
      organizationId: "organization_id",
      source: "source",
    },
    organizationExternalTmsProviderCredentials: {
      organizationId: "organization_id",
      providerKind: "provider_kind",
      id: "id",
    },
  },
}));

describe("loadCrowdinProjectCredential", () => {
  it("resolves encoded external project ids from the active Crowdin credential", async () => {
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });
    const credential = {
      id: "cred_1",
      providerKind: "crowdin",
      authMode: "oauth",
    };

    getActiveCredentialMock.mockResolvedValueOnce(credential);

    const { loadCrowdinProjectCredential } = await import("./load-crowdin-project-credential");
    const result = await loadCrowdinProjectCredential({
      organizationId: "org_1",
      projectId,
    });

    expect(result).toEqual({
      externalProjectId: "902807",
      credential,
    });
  });
});
