import { describe, expect, it, vi } from "vite-plus/test";

import { PhraseApiClient, PhraseApiError } from "./phrase-api";
import { PHRASE_US_BASE_URL } from "./phrase-base-url";

describe("PhraseApiClient", () => {
  function createClient(fetchFn: typeof fetch, options?: { region?: string; baseUrl?: string }) {
    return new PhraseApiClient({
      token: "test-token",
      region: options?.region,
      baseUrl: options?.baseUrl,
      fetchFn,
    });
  }

  it("lists projects with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("page=1")) {
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

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const projects = await client.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: "proj-1",
      name: "Marketing Website",
      slug: "marketing-website",
      mainFormat: "json",
      account: { id: "acct-1", slug: "acme" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lists locales for a project", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify([
          { id: "loc-en", name: "en", code: "en-US", default: true },
          { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
        ]),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const locales = await client.listLocales("proj-1");

    expect(locales).toEqual([
      { id: "loc-en", name: "en", code: "en-US", default: true },
      { id: "loc-fr", name: "fr", code: "fr-FR", default: false },
    ]);
  });

  it("uses the US base URL when region is us", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock, { region: "us" });
    await client.listProjects();

    expect(client.resolvedBaseUrl).toBe(PHRASE_US_BASE_URL);
    const requestUrl = vi.mocked(fetchMock).mock.calls[0]?.[0];
    expect(requestUrl).toBeTypeOf("string");
    expect(requestUrl).toContain(PHRASE_US_BASE_URL);
  });

  it("lists keys, uploads, and translations with branch filters", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.includes("/keys")) {
        return new Response(
          JSON.stringify([
            {
              id: "key-1",
              name: "home.hero.title",
              tags: ["app"],
              custom_metadata: { screen: "home" },
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/uploads")) {
        return new Response(
          JSON.stringify([
            {
              id: "upload-1",
              filename: "home.json",
              format: "json",
              tags: ["app"],
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/translations")) {
        return new Response(
          JSON.stringify([
            {
              id: "tr-1",
              key_id: "key-1",
              locale_name: "fr",
              content: "Bonjour",
              state: "translated",
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const keys = await client.listKeys("proj-1", { branch: "feature" });
    const uploads = await client.listUploads("proj-1", { branch: "feature" });
    const translations = await client.listTranslations("proj-1", "fr", { branch: "feature" });

    expect(keys[0]).toMatchObject({
      id: "key-1",
      name: "home.hero.title",
      tags: ["app"],
      customMetadata: { screen: "home" },
    });
    expect(uploads[0]).toMatchObject({ id: "upload-1", filename: "home.json", format: "json" });
    expect(translations[0]).toMatchObject({
      keyId: "key-1",
      localeName: "fr",
      content: "Bonjour",
      state: "translated",
    });
    const keysRequestUrl = vi.mocked(fetchMock).mock.calls[0]?.[0];
    expect(typeof keysRequestUrl === "string" ? keysRequestUrl : "").toContain("branch=feature");
  });

  it("updates an existing translation when POST conflicts", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/translations") && method === "POST") {
        return new Response(JSON.stringify({ message: "already exists" }), { status: 422 });
      }

      if (path.includes("/translations") && method === "GET") {
        return new Response(
          JSON.stringify([
            {
              id: "tr-existing",
              key_id: "key-1",
              locale_name: "fr",
              content: "Ancien",
              state: "translated",
            },
          ]),
          { status: 200 },
        );
      }

      if (path.includes("/translations/tr-existing") && method === "PATCH") {
        return new Response(
          JSON.stringify({
            id: "tr-existing",
            key_id: "key-1",
            locale_name: "fr",
            content: "Bonjour",
            state: "translated",
            unverified: false,
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const translation = await client.upsertTranslation("proj-1", {
      keyId: "key-1",
      localeName: "fr",
      content: "Bonjour",
    });

    expect(translation).toMatchObject({
      id: "tr-existing",
      keyId: "key-1",
      localeName: "fr",
      content: "Bonjour",
    });

    const methods = vi.mocked(fetchMock).mock.calls.map(([, requestInit]) => requestInit?.method);
    expect(methods).toEqual(expect.arrayContaining(["POST", "GET", "PATCH"]));
  });

  it("rethrows non-conflict 422 responses from translation POST", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/translations") && method === "POST") {
        return new Response(JSON.stringify({ message: "Invalid content encoding" }), {
          status: 422,
        });
      }

      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(
      client.upsertTranslation("proj-1", {
        keyId: "key-1",
        localeName: "fr",
        content: "Bonjour",
      }),
    ).rejects.toMatchObject({
      status: 422,
    });

    const methods = vi.mocked(fetchMock).mock.calls.map(([, requestInit]) => requestInit?.method);
    expect(methods).not.toContain("PATCH");
  });

  it("throws PhraseApiError for non-success responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.listProjects()).rejects.toBeInstanceOf(PhraseApiError);
  });
});
