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
    expect(String(vi.mocked(fetchMock).mock.calls[0]?.[0])).toContain(PHRASE_US_BASE_URL);
  });

  it("throws PhraseApiError for non-success responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.listProjects()).rejects.toBeInstanceOf(PhraseApiError);
  });
});
