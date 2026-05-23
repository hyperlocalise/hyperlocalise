import { describe, expect, it, vi } from "vite-plus/test";

import {
  buildLokaliseProjectUrl,
  LokaliseApiClient,
  LokaliseApiError,
  partitionLokaliseLocales,
} from "./lokalise-api";

describe("LokaliseApiClient", () => {
  function createClient(fetchFn: typeof fetch) {
    return new LokaliseApiClient({
      token: "test-token",
      baseUrl: "https://api.lokalise.test/api2",
      fetchFn,
    });
  }

  it("lists projects with pagination", async () => {
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

      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const projects = await client.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      projectId: "proj.123",
      name: "Marketing Website",
      projectType: "localization_files",
      teamId: 42,
      baseLanguageId: 640,
      baseLanguageIso: "en",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lokalise.test/api2/projects?page=1&limit=100",
      expect.objectContaining({
        headers: { "X-Api-Token": "test-token" },
      }),
    );
  });

  it("lists project languages with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
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

      return new Response(JSON.stringify({ languages: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const languages = await client.listProjectLanguages("proj.123");

    expect(languages).toHaveLength(2);
    expect(languages[0]).toMatchObject({ langId: 640, langIso: "en", langName: "English" });
    expect(languages[1]).toMatchObject({ langId: 673, langIso: "fr", langName: "French" });
  });

  it("throws LokaliseApiError on auth failure", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
        status: 401,
      });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.listProjects()).rejects.toBeInstanceOf(LokaliseApiError);
    await expect(client.listProjects()).rejects.toMatchObject({ status: 401 });
  });
});

describe("partitionLokaliseLocales", () => {
  it("uses base language metadata to split source and target locales", () => {
    const { sourceLocale, targetLocales } = partitionLokaliseLocales(
      { baseLanguageId: 640, baseLanguageIso: "en" },
      [
        { langId: 640, langIso: "en", langName: "English", isRtl: false },
        { langId: 673, langIso: "fr", langName: "French", isRtl: false },
      ],
    );

    expect(sourceLocale).toBe("en");
    expect(targetLocales).toEqual(["fr"]);
  });
});

describe("buildLokaliseProjectUrl", () => {
  it("builds the app URL for a project", () => {
    expect(buildLokaliseProjectUrl("proj.123")).toBe("https://app.lokalise.com/project/proj.123/");
  });
});
