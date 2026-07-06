import { describe, expect, it, vi } from "vite-plus/test";

import { memorySupportsLiveSearch } from "@/lib/providers/contracts/memory-live-search";
import { lokaliseTmsProvider } from "./lokalise-provider";

describe("memorySupportsLiveSearch", () => {
  it("allows synced Lokalise memories to fall back to live key scans", () => {
    expect(
      memorySupportsLiveSearch({
        capabilityMode: "synced_import",
        externalProviderKind: "lokalise",
      }),
    ).toBe(true);
  });

  it("allows synced Smartling memories to fall back to live entry scans", () => {
    expect(
      memorySupportsLiveSearch({
        capabilityMode: "synced_import",
        externalProviderKind: "smartling",
      }),
    ).toBe(true);
  });

  it("keeps other providers on live_search only", () => {
    expect(
      memorySupportsLiveSearch({
        capabilityMode: "synced_import",
        externalProviderKind: "phrase",
      }),
    ).toBe(false);
  });
});

describe("lokaliseTmsProvider.searchTranslationMemoryMatches", () => {
  it("normalizes key translation matches for attached memories", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes("/keys")) {
        return new Response(JSON.stringify({ keys: [] }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          keys: [
            {
              key_id: 42,
              key_name: "greeting",
              translations: [
                { language_iso: "en", translation: "Hello" },
                { language_iso: "fr", translation: "Bonjour" },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const matches = await lokaliseTmsProvider.searchTranslationMemoryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      externalProjectId: "proj.123",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      secretMaterial: "token",
      memory: {
        id: "memory_local_1",
        name: "Lokalise TM",
        externalMemoryId: "proj.123:translation-memory",
        capabilityMode: "synced_import",
      },
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
      limit: 5,
    } as never);

    vi.unstubAllGlobals();

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      memoryId: "memory_local_1",
      sourceText: "Hello",
      targetText: "Bonjour",
      matchSource: "live_provider",
      externalResourceId: "proj.123:translation-memory",
      externalSegmentId: "42",
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns no matches when external memory id is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const matches = await lokaliseTmsProvider.searchTranslationMemoryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      externalProjectId: "proj.123",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      secretMaterial: "token",
      memory: {
        id: "memory_local_1",
        name: "Lokalise TM",
        externalMemoryId: null,
        capabilityMode: "synced_import",
      },
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
      limit: 5,
    } as never);

    vi.unstubAllGlobals();

    expect(matches).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no matches for a different external memory id", async () => {
    const matches = await lokaliseTmsProvider.searchTranslationMemoryMatches({
      organizationId: "org_1",
      projectId: "project_1",
      externalProjectId: "proj.123",
      credential: {
        id: "cred_1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      secretMaterial: "token",
      memory: {
        id: "memory_local_1",
        name: "Lokalise TM",
        externalMemoryId: "other:translation-memory",
        capabilityMode: "synced_import",
      },
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Hello",
      limit: 5,
    } as never);

    expect(matches).toEqual([]);
  });
});
