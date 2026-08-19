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

import { isErr, isOk } from "@/lib/primitives/result/results";

import { crowdinTmsProvider } from "./crowdin-provider";

const { loadProjectCredentialMock, fetchMock } = vi.hoisted(() => ({
  loadProjectCredentialMock: vi.fn(),
  fetchMock: vi.fn(),
}));

const baseCredential = {
  encryptionAlgorithm: "aes-256-gcm",
  keyVersion: 1,
  ciphertext: "cipher",
  iv: "iv",
  authTag: "tag",
  baseUrl: "https://api.crowdin.test/api/v2",
  providerKind: "crowdin" as const,
  authMode: "api_token",
};

vi.mock("./crowdin-auth", () => ({
  crowdinAuth: {
    loadOrganizationCredential: vi.fn(),
    loadProjectCredential: (...args: unknown[]) => loadProjectCredentialMock(...args),
  },
}));

vi.mock("@/lib/providers/shared/tms-provider-content", () => ({
  resolveExternalTmsSecretMaterialForActor: vi.fn(async () => "token"),
}));

describe("crowdinTmsProvider.searchConcordanceForAgent", () => {
  beforeEach(() => {
    loadProjectCredentialMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns glossary and translation-memory matches for a project", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("/glossaries/concordance")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  glossary: { id: 9, name: "Product glossary" },
                  sourceTerms: [{ id: 1, languageId: "en", text: "Save", status: "preferred" }],
                  targetTerms: [{ id: 2, languageId: "de", text: "Speichern", status: "preferred" }],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: [
            {
              data: {
                tm: { id: 3, name: "Product TM" },
                recordId: 88,
                source: "Save changes",
                target: "Änderungen speichern",
                relevant: 92,
                substituted: "Save changes",
                updatedAt: "2026-08-01T00:00:00.000Z",
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await crowdinTmsProvider.searchConcordanceForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "ext:crowdin:42",
      sourceLocale: "en",
      targetLocale: "de",
      expressions: ["Save"],
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }

    expect(result.value).toEqual({
      crowdinProjectId: 42,
      glossaryMatches: [
        {
          glossaryId: 9,
          glossaryName: "Product glossary",
          sourceTerm: "Save",
          targetTerm: "Speichern",
          status: "preferred",
          description: null,
        },
      ],
      translationMemoryMatches: [
        {
          memoryId: 3,
          memoryName: "Product TM",
          recordId: 88,
          sourceText: "Save changes",
          targetText: "Änderungen speichern",
          matchScore: 92,
        },
      ],
    });
  });

  it("returns not configured when the project is not linked to Crowdin", async () => {
    loadProjectCredentialMock.mockResolvedValue(null);

    const result = await crowdinTmsProvider.searchConcordanceForAgent({
      organizationId: "org-1",
      projectId: "project-1",
      sourceLocale: "en",
      targetLocale: "de",
      expressions: ["Save"],
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }
    expect(result.error.code).toBe("crowdin_not_configured");
  });
});

describe("crowdinTmsProvider.loadStyleGuideForAgent", () => {
  beforeEach(() => {
    loadProjectCredentialMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns enabled prompts that apply to the project", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              data: {
                id: 1,
                name: "Brand voice",
                action: "assist",
                isEnabled: true,
                enabledProjectIds: [42],
                config: {
                  companyDescription: "Acme",
                  prompt: "Use sentence case.",
                },
              },
            },
            {
              data: {
                id: 2,
                name: "Disabled",
                action: "assist",
                isEnabled: false,
                config: { prompt: "Ignore" },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await crowdinTmsProvider.loadStyleGuideForAgent({
      organizationId: "org-1",
      projectId: "ext:crowdin:42",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }
    expect(result.value.prompts).toEqual([
      {
        id: 1,
        name: "Brand voice",
        action: "assist",
        companyDescription: "Acme",
        projectDescription: null,
        audienceDescription: null,
        prompt: "Use sentence case.",
      },
    ]);
  });

  it("returns an empty prompt list when AI listing is unavailable", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    const result = await crowdinTmsProvider.loadStyleGuideForAgent({
      organizationId: "org-1",
      projectId: "ext:crowdin:42",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }
    expect(result.value.prompts).toEqual([]);
  });
});
