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
                  targetTerms: [
                    { id: 2, languageId: "de", text: "Speichern", status: "preferred" },
                  ],
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

  it("passes the abort signal to Crowdin fetches", async () => {
    const abortSignal = new AbortController().signal;
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    await crowdinTmsProvider.searchConcordanceForAgent({
      organizationId: "org-1",
      projectId: "ext:crowdin:42",
      sourceLocale: "en",
      targetLocale: "de",
      expressions: ["Save"],
      signal: abortSignal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/glossaries/concordance"),
      expect.objectContaining({ signal: abortSignal }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tms/concordance"),
      expect.objectContaining({ signal: abortSignal }),
    );
  });

  it("rethrows abort errors instead of mapping them to API failures", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValue(abortError);

    await expect(
      crowdinTmsProvider.searchConcordanceForAgent({
        organizationId: "org-1",
        projectId: "ext:crowdin:42",
        sourceLocale: "en",
        targetLocale: "de",
        expressions: ["Save"],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns empty matches for blank expressions without calling Crowdin search APIs", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const result = await crowdinTmsProvider.searchConcordanceForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "ext:crowdin:42",
      sourceLocale: "en",
      targetLocale: "de",
      expressions: ["  ", "", "\t"],
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }
    expect(result.value).toEqual({
      crowdinProjectId: 42,
      glossaryMatches: [],
      translationMemoryMatches: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trims, dedupes, and caps expressions before searching", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const expressions = Array.from({ length: 25 }, (_, index) => ` term-${index} `);
    expressions.push("term-0", "  ", "term-1");

    await crowdinTmsProvider.searchConcordanceForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "ext:crowdin:42",
      sourceLocale: "en",
      targetLocale: "de",
      expressions,
    });

    const glossaryCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/glossaries/concordance"),
    );
    expect(glossaryCall).toBeDefined();
    const body = JSON.parse(String(glossaryCall?.[1]?.body ?? "{}")) as {
      expressions?: string[];
    };
    expect(body.expressions).toHaveLength(20);
    expect(body.expressions?.[0]).toBe("term-0");
    expect(body.expressions?.[19]).toBe("term-19");
    expect(new Set(body.expressions).size).toBe(20);
  });

  it("clamps glossary and translation-memory limits and stops glossary cartesian growth", async () => {
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
                  sourceTerms: [
                    { id: 1, languageId: "en", text: "Save", status: "preferred" },
                    { id: 3, languageId: "en", text: "Store", status: "preferred" },
                  ],
                  targetTerms: [
                    { id: 2, languageId: "de", text: "Speichern", status: "preferred" },
                    { id: 4, languageId: "de", text: "Lagern", status: "preferred" },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          data: Array.from({ length: 5 }, (_, index) => ({
            data: {
              tm: { id: 3, name: "Product TM" },
              recordId: index + 1,
              source: `Save ${index}`,
              target: `Speichern ${index}`,
              relevant: 90 - index,
              substituted: `Save ${index}`,
              updatedAt: "2026-08-01T00:00:00.000Z",
            },
          })),
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
      glossaryLimit: 0,
      translationMemoryLimit: 100,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      return;
    }
    // glossaryLimit 0 clamps to 1; TM limit 100 clamps to 50 but only 5 rows exist.
    expect(result.value.glossaryMatches).toHaveLength(1);
    expect(result.value.translationMemoryMatches).toHaveLength(5);
  });

  it("skips glossary rows with wrong locales or empty terms", async () => {
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
                  glossary: { id: 1, name: "Wrong locale" },
                  sourceTerms: [{ id: 1, languageId: "fr", text: "Save" }],
                  targetTerms: [{ id: 2, languageId: "de", text: "Speichern" }],
                },
              },
              {
                data: {
                  glossary: { id: 2, name: "Blank term" },
                  sourceTerms: [{ id: 3, languageId: "en", text: "  " }],
                  targetTerms: [{ id: 4, languageId: "de", text: "Speichern" }],
                },
              },
              {
                data: {
                  glossary: { id: 3, name: "Valid" },
                  sourceTerms: [{ id: 5, languageId: "en", text: " Save " }],
                  targetTerms: [{ id: 6, languageId: "de", text: " Speichern " }],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
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
    expect(result.value.glossaryMatches).toEqual([
      {
        glossaryId: 3,
        glossaryName: "Valid",
        sourceTerm: "Save",
        targetTerm: "Speichern",
        status: null,
        description: null,
      },
    ]);
  });

  it("maps Crowdin 401 responses to a reconnectable API error", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const result = await crowdinTmsProvider.searchConcordanceForAgent({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "ext:crowdin:42",
      sourceLocale: "en",
      targetLocale: "de",
      expressions: ["Save"],
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }
    expect(result.error).toEqual({
      code: "crowdin_api_error",
      message: "Crowdin authentication failed. Reconnect Crowdin and try again.",
    });
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

  it("rethrows abort errors instead of returning an empty prompt list", async () => {
    loadProjectCredentialMock.mockResolvedValue({
      externalProjectId: "42",
      credential: baseCredential,
    });
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValue(abortError);

    await expect(
      crowdinTmsProvider.loadStyleGuideForAgent({
        organizationId: "org-1",
        projectId: "ext:crowdin:42",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
