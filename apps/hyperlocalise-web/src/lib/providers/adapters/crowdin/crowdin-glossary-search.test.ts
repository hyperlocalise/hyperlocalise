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

const { loadOrganizationCredentialMock, loadProjectCredentialMock, fetchMock } = vi.hoisted(() => ({
  loadOrganizationCredentialMock: vi.fn(),
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
    loadOrganizationCredential: (...args: unknown[]) => loadOrganizationCredentialMock(...args),
    loadProjectCredential: (...args: unknown[]) => loadProjectCredentialMock(...args),
  },
}));

vi.mock("@/lib/providers/shared/tms-provider-content", () => ({
  resolveExternalTmsSecretMaterialForActor: vi.fn(async () => "token"),
}));

function concordanceHit(source: string, target: string) {
  return {
    glossary: { id: 9, name: "Product glossary" },
    sourceTerms: [{ id: 1, languageId: "en", text: source, status: "preferred" }],
    targetTerms: [{ id: 2, languageId: "vi", text: target, status: "preferred" }],
  };
}

describe("crowdinTmsProvider.searchGlossaryForAgent", () => {
  beforeEach(() => {
    loadOrganizationCredentialMock.mockReset();
    loadProjectCredentialMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("uses organization concordance when no projectId is provided", async () => {
    loadOrganizationCredentialMock.mockResolvedValue(baseCredential);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ data: concordanceHit("Talk to Heidi", "Nói chuyện với Heidi") }],
        }),
        {
          status: 200,
        },
      ),
    );

    const result = await crowdinTmsProvider.searchGlossaryForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      sourceLocale: "en",
      targetLocale: "vi",
      expressions: ["Talk to Heidi"],
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }

    expect(result.value.scope).toBe("organization");
    expect(result.value.matches[0]?.targetTerm).toBe("Nói chuyện với Heidi");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/glossaries/concordance");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("/projects/");
  });

  it("converts BCP-47 locales before concordance search and term filtering", async () => {
    loadOrganizationCredentialMock.mockResolvedValue(baseCredential);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ data: concordanceHit("Talk to Heidi", "Nói chuyện với Heidi") }],
        }),
        { status: 200 },
      ),
    );

    const result = await crowdinTmsProvider.searchGlossaryForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      sourceLocale: "en-US",
      targetLocale: "vi-VN",
      expressions: ["Talk to Heidi"],
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      sourceLanguageId: string;
      targetLanguageId: string;
    };
    expect(requestBody).toMatchObject({
      sourceLanguageId: "en",
      targetLanguageId: "vi",
    });
    expect(result.value.matches[0]?.targetTerm).toBe("Nói chuyện với Heidi");
  });

  it("preserves every same-locale target term and its status", async () => {
    loadOrganizationCredentialMock.mockResolvedValue(baseCredential);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              data: {
                glossary: { id: 9, name: "Product glossary" },
                sourceTerms: [{ id: 1, languageId: "en", text: "Home", status: "preferred" }],
                targetTerms: [
                  {
                    id: 2,
                    languageId: "vi",
                    text: "Trang chủ",
                    status: "preferred",
                    description: "Use this term",
                  },
                  {
                    id: 3,
                    languageId: "vi",
                    text: "Nhà",
                    status: "forbidden",
                    description: "Do not use",
                  },
                  { id: 4, languageId: "fr", text: "Accueil", status: "preferred" },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await crowdinTmsProvider.searchGlossaryForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      sourceLocale: "en",
      targetLocale: "vi",
      expressions: ["Home"],
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }

    expect(result.value.matches).toEqual([
      {
        glossaryId: 9,
        glossaryName: "Product glossary",
        sourceTerm: "Home",
        targetTerm: "Trang chủ",
        status: "preferred",
        description: "Use this term",
      },
      {
        glossaryId: 9,
        glossaryName: "Product glossary",
        sourceTerm: "Home",
        targetTerm: "Nhà",
        status: "forbidden",
        description: "Do not use",
      },
    ]);
  });

  it("uses project concordance when a Crowdin-linked project is provided", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ data: concordanceHit("Talk to Heidi", "Nói chuyện với Heidi") }],
        }),
        {
          status: 200,
        },
      ),
    );

    const result = await crowdinTmsProvider.searchGlossaryForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "project-1",
      sourceLocale: "en",
      targetLocale: "vi",
      expressions: ["Talk to Heidi"],
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }

    expect(result.value.scope).toBe("project");
    expect(result.value.crowdinProjectId).toBe(42);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/projects/42/glossaries/concordance");
  });

  it("returns not configured when Crowdin credentials are missing", async () => {
    loadOrganizationCredentialMock.mockResolvedValue(null);

    const result = await crowdinTmsProvider.searchGlossaryForAgent({
      organizationId: "org-1",
      sourceLocale: "en",
      targetLocale: "vi",
      expressions: ["Talk to Heidi"],
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }

    expect(result.error.code).toBe("crowdin_not_configured");
  });
});
