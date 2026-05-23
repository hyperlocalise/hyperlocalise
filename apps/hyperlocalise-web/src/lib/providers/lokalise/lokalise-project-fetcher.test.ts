import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { requestUrlString } from "../fetch-mock-helpers";
import { fetchLokaliseProjects } from "./lokalise-project-fetcher";

describe("fetchLokaliseProjects", () => {
  afterEach(() => vi.unstubAllGlobals());

  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "lokalise" as const,
    displayName: "Lokalise",
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
      if (String(url).includes("/projects?page=1")) {
        return new Response(
          JSON.stringify({
            projects: [
              {
                project_id: "proj.123",
                name: "Marketing Website",
                project_type: "localization_files",
                team_id: 42,
                base_language_id: 640,
                base_language_iso: "en",
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/projects/proj.123/languages")) {
        return new Response(
          JSON.stringify({
            project_id: "proj.123",
            languages: [
              { lang_id: 640, lang_iso: "en", lang_name: "English", is_rtl: false },
              { lang_id: 673, lang_iso: "fr", lang_name: "French", is_rtl: false },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ projects: [], languages: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const projects = await fetchLokaliseProjects({
      organizationId: "org-1",
      providerKind: "lokalise",
      credential,
      secretMaterial: "lokalise-token",
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      externalProjectId: "proj.123",
      name: "Marketing Website",
      sourceLocale: "en",
      targetLocales: ["fr"],
      externalProjectUrl: "https://app.lokalise.com/project/proj.123/",
      isActive: true,
      metadata: {
        projectType: "localization_files",
        teamId: 42,
        description: null,
        baseLanguageId: 640,
        languages: [
          { id: 640, iso: "en", name: "English", isRtl: false },
          { id: 673, iso: "fr", name: "French", isRtl: false },
        ],
      },
    });
  });

  it("stops locale fetches after an auth failure during concurrent project mapping", async () => {
    const projects = Array.from({ length: 20 }, (_, index) => ({
      project_id: `proj.${index}`,
      name: `Project ${index}`,
      project_type: "localization_files",
      team_id: 42,
      base_language_id: 640,
      base_language_iso: "en",
    }));

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/projects?page=1")) {
        return new Response(JSON.stringify({ projects }), { status: 200 });
      }

      if (String(url).includes("/projects/proj.0/languages")) {
        return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
          status: 401,
        });
      }

      if (String(url).includes("/projects/") && String(url).includes("/languages")) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return new Response(
          JSON.stringify({
            project_id: "proj.1",
            languages: [{ lang_id: 640, lang_iso: "en", lang_name: "English", is_rtl: false }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ projects: [], languages: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLokaliseProjects({
        organizationId: "org-1",
        providerKind: "lokalise",
        credential,
        secretMaterial: "invalid-token",
      }),
    ).rejects.toThrow("lokalise_auth_invalid");

    const languageFetches = vi
      .mocked(fetchMock)
      .mock.calls.filter((call) => requestUrlString(call[0]).includes("/languages"));
    expect(languageFetches.length).toBeLessThan(20);
  });

  it("throws lokalise_auth_invalid when authentication fails", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
        status: 401,
      });
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLokaliseProjects({
        organizationId: "org-1",
        providerKind: "lokalise",
        credential,
        secretMaterial: "invalid-token",
      }),
    ).rejects.toThrow("lokalise_auth_invalid");
  });
});
