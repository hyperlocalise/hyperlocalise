import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { phraseTmsProvider } from "./phrase-provider";
import { PHRASE_US_BASE_URL } from "./phrase-api";

describe("phraseTmsProvider.fetchProjects", () => {
  afterEach(() => vi.unstubAllGlobals());

  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "phrase" as const,
    displayName: "Phrase",
    region: null,
    baseUrl: null,
    validationStatus: "connected",
    validationMessage: null,
    lastValidatedAt: null,
    encryptionAlgorithm: "aes-256-gcm",
    keyVersion: 1,
    ciphertext: "cipher",
    iv: "iv",
    authTag: "tag",
    maskedSecretSuffix: "cret",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("normalizes projects and locales into the shared provider model", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/projects?page=1&per_page=100")) {
        return new Response(
          JSON.stringify([
            {
              id: "proj-1",
              name: "Marketing Website",
              slug: "marketing-website",
              main_format: "json",
              account: { id: "acct-1", name: "Acme", slug: "acme" },
            },
          ]),
          { status: 200 },
        );
      }

      if (String(url).includes("/projects/proj-1/locales")) {
        return new Response(
          JSON.stringify([
            { id: "loc-en", name: "en", code: "en-US", default: true },
            { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const projects = await phraseTmsProvider.fetchProjects({
      organizationId: "org-1",
      credential,
      secretMaterial: "phrase-token",
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      externalProjectId: "proj-1",
      name: "Marketing Website",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      externalProjectUrl: "https://app.phrase.com/accounts/acme/projects/marketing-website",
      isActive: true,
      metadata: {
        slug: "marketing-website",
        mainFormat: "json",
        accountId: "acct-1",
        accountSlug: "acme",
        locales: [
          { id: "loc-en", name: "en", code: "en-US", default: true },
          { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
        ],
      },
    });
  });

  it("uses the US datacenter when region is us", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/projects?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    await phraseTmsProvider.fetchProjects({
      organizationId: "org-1",
      credential: { ...credential, region: "us" },
      secretMaterial: "phrase-token",
    });

    const requestUrl = vi.mocked(fetchMock).mock.calls[0]?.[0];
    expect(requestUrl).toBeTypeOf("string");
    expect(requestUrl).toContain(PHRASE_US_BASE_URL);
  });

  it("throws phrase_auth_invalid when authentication fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      phraseTmsProvider.fetchProjects({
        organizationId: "org-1",
        credential,
        secretMaterial: "invalid-token",
      }),
    ).rejects.toThrow("phrase_auth_invalid");
  });
});
