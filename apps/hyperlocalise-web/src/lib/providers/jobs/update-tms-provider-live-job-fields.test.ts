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

const {
  getActiveOrganizationExternalTmsProviderCredentialRowMock,
  resolveExternalTmsSecretMaterialMock,
  crowdinFetchProjectsMock,
  smartlingFetchProjectsMock,
  phraseFetchProjectsMock,
  getUserConnectionMock,
  resolveUserConnectionSecretMaterialMock,
  editTaskFieldsMock,
  listProjectsMock,
} = vi.hoisted(() => ({
  getActiveOrganizationExternalTmsProviderCredentialRowMock: vi.fn(),
  resolveExternalTmsSecretMaterialMock: vi.fn(),
  crowdinFetchProjectsMock: vi.fn(),
  smartlingFetchProjectsMock: vi.fn(),
  phraseFetchProjectsMock: vi.fn(),
  getUserConnectionMock: vi.fn(),
  resolveUserConnectionSecretMaterialMock: vi.fn(),
  editTaskFieldsMock: vi.fn(),
  listProjectsMock: vi.fn(),
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

vi.mock("@/lib/providers/adapters/tms-provider-registry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/providers/adapters/tms-provider-registry")>();
  return {
    ...actual,
    tmsProviderProjectFetchers: {
      crowdin: (...args: unknown[]) => crowdinFetchProjectsMock(...args),
      smartling: (...args: unknown[]) => smartlingFetchProjectsMock(...args),
      phrase: (...args: unknown[]) => phraseFetchProjectsMock(...args),
      lokalise: vi.fn(),
    },
  };
});

vi.mock("@/lib/providers/adapters/crowdin/crowdin-auth", () => ({
  crowdinAuth: {
    getUserConnection: (...args: unknown[]) => getUserConnectionMock(...args),
    resolveUserConnectionSecretMaterial: (...args: unknown[]) =>
      resolveUserConnectionSecretMaterialMock(...args),
  },
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", () => ({
  CrowdinApiClient: vi.fn(function CrowdinApiClientMock() {
    return {
      listProjects: listProjectsMock,
      editTaskFields: editTaskFieldsMock,
    };
  }),
  CrowdinApiError: class CrowdinApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "CrowdinApiError";
      this.status = status;
    }
  },
}));

import { encodeProviderJobId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { TmsProviderLiveError } from "@/lib/providers/jobs/tms-provider-live-error";
import { updateTmsProviderLiveJobFields } from "./tms-provider-live";

const crowdinCredential = {
  id: "credential-crowdin-fields",
  providerKind: "crowdin" as const,
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

const smartlingCredential = {
  ...crowdinCredential,
  id: "credential-smartling-fields",
  providerKind: "smartling" as const,
  authMode: "user_secret",
  displayName: "Smartling",
};

const phraseCredential = {
  ...crowdinCredential,
  id: "credential-phrase-fields",
  providerKind: "phrase" as const,
  authMode: "api_token",
  displayName: "Phrase",
  baseUrl: "https://cloud.memsource.com",
};

const crowdinJobId = encodeProviderJobId({
  providerKind: "crowdin",
  externalProjectId: "902807",
  externalJobId: "5001",
});

const smartlingJobId = encodeProviderJobId({
  providerKind: "smartling",
  externalProjectId: "project-a",
  externalJobId: "job-1",
});

const phraseJobId = encodeProviderJobId({
  providerKind: "phrase",
  externalProjectId: "phrase-project",
  externalJobId: "phrase-job",
});

describe("updateTmsProviderLiveJobFields", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty field updates before loading provider context", async () => {
    await expect(
      updateTmsProviderLiveJobFields("org-fields-1", crowdinJobId, {}, "user-1"),
    ).rejects.toMatchObject({
      code: "invalid_job_update",
      message: "At least one of title, description, or assigneeExternalUserIds is required.",
    });
    expect(getActiveOrganizationExternalTmsProviderCredentialRowMock).not.toHaveBeenCalled();
  });

  it("rejects invalid encoded job ids", async () => {
    await expect(
      updateTmsProviderLiveJobFields(
        "org-fields-1",
        "not-a-provider-job",
        { title: "X" },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "invalid_encoded_job_id",
    });
  });

  it("rejects field updates for unsupported providers", async () => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(phraseCredential);
    resolveExternalTmsSecretMaterialMock.mockResolvedValue("phrase-token");

    await expect(
      updateTmsProviderLiveJobFields(
        "org-fields-phrase",
        phraseJobId,
        { title: "Updated" },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "unsupported_job_field_update",
      message: "Job field edits are not supported for phrase.",
    });
    expect(phraseFetchProjectsMock).not.toHaveBeenCalled();
  });

  it("rejects Smartling assignee updates", async () => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(
      smartlingCredential,
    );
    resolveExternalTmsSecretMaterialMock.mockResolvedValue(
      JSON.stringify({ userIdentifier: "user", userSecret: "secret" }),
    );

    await expect(
      updateTmsProviderLiveJobFields(
        "org-fields-smartling",
        smartlingJobId,
        { assigneeExternalUserIds: ["1"] },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "unsupported_job_field_update",
      message: "Assignee updates are not supported for Smartling jobs.",
    });
    expect(smartlingFetchProjectsMock).not.toHaveBeenCalled();
  });

  it("requires a Crowdin user connection before editing Crowdin tasks", async () => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(crowdinCredential);
    resolveExternalTmsSecretMaterialMock.mockResolvedValue("crowdin-token");
    crowdinFetchProjectsMock.mockResolvedValue([
      {
        externalProjectId: "902807",
        name: "Crowdin Project",
        sourceLocale: "en",
        targetLocales: ["fr"],
      },
    ]);
    getUserConnectionMock.mockResolvedValue(null);

    const promise = updateTmsProviderLiveJobFields(
      "org-fields-crowdin-conn",
      crowdinJobId,
      { title: "Updated Crowdin task" },
      "user-1",
    );

    await expect(promise).rejects.toBeInstanceOf(TmsProviderLiveError);
    await expect(promise).rejects.toMatchObject({
      code: "crowdin_user_connection_required",
      message: "Connect your Crowdin account before editing Crowdin tasks.",
    });
    expect(editTaskFieldsMock).not.toHaveBeenCalled();
  });

  it("maps invalid Crowdin assignee ids to a live provider error", async () => {
    getActiveOrganizationExternalTmsProviderCredentialRowMock.mockResolvedValue(crowdinCredential);
    resolveExternalTmsSecretMaterialMock.mockResolvedValue("crowdin-token");
    crowdinFetchProjectsMock.mockResolvedValue([
      {
        externalProjectId: "902807",
        name: "Crowdin Project",
        sourceLocale: "en",
        targetLocales: ["fr"],
      },
    ]);
    getUserConnectionMock.mockResolvedValue({ id: "connection-1" });
    resolveUserConnectionSecretMaterialMock.mockResolvedValue("user-access-token");
    editTaskFieldsMock.mockRejectedValue(new Error("invalid_crowdin_assignee_id"));

    await expect(
      updateTmsProviderLiveJobFields(
        "org-fields-crowdin-assignee",
        crowdinJobId,
        { assigneeExternalUserIds: ["abc"] },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "invalid_crowdin_assignee_id",
      message: "Assignee ids must be canonical positive Crowdin member ids.",
    });
  });
});
