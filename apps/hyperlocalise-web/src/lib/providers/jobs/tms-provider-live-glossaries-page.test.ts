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

const {
  getActiveOrganizationExternalTmsProviderCredentialRowMock,
  resolveExternalTmsSecretMaterialMock,
} = vi.hoisted(() => ({
  getActiveOrganizationExternalTmsProviderCredentialRowMock: vi.fn(),
  resolveExternalTmsSecretMaterialMock: vi.fn(),
}));

vi.mock(
  "@/lib/providers/credentials/organization-external-tms-provider-credentials",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/providers/credentials/organization-external-tms-provider-credentials")
      >();
    return {
      ...actual,
      getActiveOrganizationExternalTmsProviderCredentialRow: (...args: unknown[]) =>
        getActiveOrganizationExternalTmsProviderCredentialRowMock(...args),
      resolveExternalTmsSecretMaterial: (...args: unknown[]) =>
        resolveExternalTmsSecretMaterialMock(...args),
    };
  },
);

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/providers/adapters/crowdin/crowdin-api")>();
  return {
    ...actual,
    CrowdinApiClient: vi.fn(function CrowdinApiClientMock() {
      return {
        listProjects: vi.fn(),
        getProject: vi.fn(),
        listBranches: vi.fn(),
      };
    }),
  };
});

import { CrowdinApiClient, CrowdinApiError } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { crowdinTmsProvider } from "@/lib/providers/adapters/crowdin/crowdin-provider";
import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live-error";
import { getTmsProviderLiveGlossary, listTmsProviderLiveGlossariesPage } from "./tms-provider-live";

const crowdinCredential = {
  id: "credential-crowdin",
  providerKind: "crowdin",
  authMode: "api_token",
  displayName: "Crowdin",
  region: null,
  baseUrl: null,
  oauthExpiresAt: null,
  validationStatus: "valid",
  validationMessage: null,
  lastValidatedAt: null,
  maskedSecretSuffix: "oken",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function stubCrowdinProjects(
  projects: Array<{
    id: number;
    name: string;
  }> = [{ id: 100, name: "Website" }],
) {
  const listProjects = vi.fn().mockResolvedValue(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      identifier: `project-${project.id}`,
      description: null,
      sourceLanguageId: "en",
      targetLanguageIds: ["fr"],
      webUrl: `https://crowdin.com/project/${project.id}`,
      isSuspended: false,
      logo: null,
      lastActivity: null,
    })),
  );
  vi.mocked(CrowdinApiClient).mockImplementation(function () {
    return { listProjects, getProject: vi.fn(), listBranches: vi.fn() } as never;
  });
  return listProjects;
}

describe("listTmsProviderLiveGlossariesPage", () => {
  beforeEach(() => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(crowdinCredential);
    resolveExternalTmsSecretMaterialMock.mockResolvedValue("crowdin-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("loads Crowdin credentials with actor context and maps a glossary page", async () => {
    stubCrowdinProjects([
      { id: 100, name: "Website" },
      { id: 200, name: "Mobile" },
    ]);
    const fetchGlossariesPage = vi
      .spyOn(crowdinTmsProvider, "fetchGlossariesPage")
      .mockResolvedValue({
        glossaries: [
          {
            externalGlossaryId: "42",
            name: "Product glossary",
            description: "Shared terms",
            sourceLocale: "en",
            targetLocale: "fr",
            localeCoverage: ["en", "fr"],
            termCount: 12,
            externalUrl: "https://crowdin.example/g/42",
            externalProjectIds: ["200", "100"],
            createdAt: "2026-03-01T12:00:00.000Z",
          },
        ],
        offset: 0,
        limit: 25,
        hasMore: true,
      });

    const page = await listTmsProviderLiveGlossariesPage("org-glossary-page-1", {
      actorUserId: "user-1",
      limit: 25,
      offset: 0,
      externalProjectId: "100",
    });

    expect(resolveExternalTmsSecretMaterialMock).toHaveBeenCalledWith({
      credential: expect.objectContaining({ id: "credential-crowdin" }),
    });
    expect(fetchGlossariesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-glossary-page-1",
        credential: expect.objectContaining({ id: "credential-crowdin" }),
        secretMaterial: "crowdin-token",
        limit: 25,
        offset: 0,
        projectId: "100",
      }),
    );
    expect(page).toEqual({
      glossaries: [
        expect.objectContaining({
          id: "crowdin:glossary:42",
          providerKind: "crowdin",
          name: "Product glossary",
          externalProjectId: "100",
          projectName: "Website",
          termCount: 12,
          createdAt: "2026-03-01T12:00:00.000Z",
        }),
      ],
      offset: 0,
      limit: 25,
      hasMore: true,
    });
  });

  it("throws when no active TMS credential is connected", async () => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(null);

    const promise = listTmsProviderLiveGlossariesPage("org-glossary-page-missing");

    await expect(promise).rejects.toBeInstanceOf(TmsProviderLiveError);
    await expect(promise).rejects.toMatchObject({
      code: "no_active_tms_provider",
    });
  });
});

describe("getTmsProviderLiveGlossary", () => {
  beforeEach(() => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(crowdinCredential);
    resolveExternalTmsSecretMaterialMock.mockResolvedValue("crowdin-token");
    stubCrowdinProjects([{ id: 100, name: "Website" }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns null for non-Crowdin or invalid live glossary ids", async () => {
    await expect(getTmsProviderLiveGlossary("org-1", "phrase:glossary:1")).resolves.toBeNull();
    await expect(getTmsProviderLiveGlossary("org-1", "crowdin:glossary:0")).resolves.toBeNull();
    await expect(getTmsProviderLiveGlossary("org-1", "not-a-glossary-id")).resolves.toBeNull();
    expect(resolveExternalTmsSecretMaterialMock).not.toHaveBeenCalled();
  });

  it("returns null when Crowdin reports the glossary is missing", async () => {
    vi.spyOn(crowdinTmsProvider, "fetchLiveGlossaryMetadata").mockRejectedValue(
      new CrowdinApiError("Glossary not found", 404, null),
    );

    await expect(
      getTmsProviderLiveGlossary("org-glossary-missing", "crowdin:glossary:99", {
        actorUserId: "user-1",
      }),
    ).resolves.toBeNull();
  });

  it("returns mapped Crowdin glossary metadata", async () => {
    vi.spyOn(crowdinTmsProvider, "fetchLiveGlossaryMetadata").mockResolvedValue({
      externalGlossaryId: "42",
      name: "Product glossary",
      description: null,
      sourceLocale: "en",
      targetLocale: "fr",
      localeCoverage: ["en", "fr"],
      termCount: 3,
      externalUrl: null,
      externalProjectIds: ["100"],
      createdAt: "2026-04-01T00:00:00.000Z",
    });

    await expect(
      getTmsProviderLiveGlossary("org-glossary-detail", "crowdin:glossary:42", {
        actorUserId: "user-2",
      }),
    ).resolves.toMatchObject({
      id: "crowdin:glossary:42",
      name: "Product glossary",
      externalProjectId: "100",
      projectName: "Website",
      createdAt: "2026-04-01T00:00:00.000Z",
    });
  });
});
