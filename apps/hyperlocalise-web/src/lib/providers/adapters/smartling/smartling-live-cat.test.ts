import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { TmsProviderLiveFile } from "@/lib/providers/jobs/tms-provider-live";

import { SmartlingLiveCatError, smartlingTmsProvider } from "./smartling-provider";

function createSmartlingFile(overrides: Partial<TmsProviderLiveFile> = {}): TmsProviderLiveFile {
  return {
    origin: "provider",
    sourcePath: "messages.json",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-06-08T00:00:00Z",
    storedFileId: null,
    metadata: {},
    filename: "messages.json",
    byteSize: null,
    provider: {
      kind: "smartling",
      resourceType: "file",
      externalProjectId: "proj-1",
      externalResourceId: "messages.json",
      externalUrl: null,
      syncState: "synced",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      localeReadiness: {},
      revision: null,
      format: "json",
      lastSyncedAt: null,
    },
    latestJob: null,
    ...overrides,
  };
}

function authResponse() {
  return new Response(
    JSON.stringify({
      response: {
        code: "SUCCESS",
        data: { accessToken: "access-token", expiresIn: 3600 },
      },
    }),
    { status: 200 },
  );
}

describe("smartling-live-cat", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("loads file segments without embedding targets in the queue", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
        return authResponse();
      }

      if (path.includes("/source-strings")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    hashcode: "hash-1",
                    stringText: "Hello",
                    fileUri: "messages.json",
                    variant: "greeting",
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await smartlingTmsProvider.buildLiveCatFile({
      secretMaterial: "user:secret",
      externalProjectId: "proj-1",
      file: createSmartlingFile(),
      targetLocale: "fr-FR",
      canEditTranslations: true,
      pagination: { offset: 0, limit: 50, queueFilter: "all", paginated: true },
    });

    expect(catFile.segments).toEqual([
      {
        externalStringId: "hash-1",
        key: "greeting",
        sourceText: "Hello",
        context: null,
        type: "greeting",
      },
    ]);
    expect(catFile.canEditTranslations).toBe(true);
  });

  it("loads a target translation for a segment", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
        return authResponse();
      }

      if (path.includes("/translations")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    hashcode: "hash-1",
                    translation: "Bonjour",
                    authorized: true,
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const target = await smartlingTmsProvider.getLiveCatSegmentTarget({
      secretMaterial: "user:secret",
      externalProjectId: "proj-1",
      file: createSmartlingFile(),
      targetLocale: "fr-FR",
      externalStringId: "hash-1",
    });

    expect(target).toEqual({
      text: "Bonjour",
      externalTranslationId: "hash-1",
      isApproved: true,
    });
  });

  it("saves a translation via upsert", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
        return authResponse();
      }

      if (path.includes("/locales/fr-FR/translations") && init?.method === "PUT") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {},
            },
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const saved = await smartlingTmsProvider.saveLiveCatTranslation({
      secretMaterial: "user:secret",
      externalProjectId: "proj-1",
      file: createSmartlingFile(),
      targetLocale: "fr-FR",
      externalStringId: "hash-1",
      text: "Bonjour",
    });

    expect(saved).toEqual({
      text: "Bonjour",
      externalTranslationId: "hash-1",
      isApproved: false,
    });
  });

  it("maps Smartling auth failures to smartling_auth_invalid", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "AUTHENTICATION_ERROR",
            errors: [{ message: "invalid credentials" }],
          },
        }),
        { status: 401 },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      smartlingTmsProvider.buildLiveCatFile({
        secretMaterial: "user:secret",
        externalProjectId: "proj-1",
        file: createSmartlingFile(),
        targetLocale: "fr-FR",
        canEditTranslations: true,
      }),
    ).rejects.toBeInstanceOf(SmartlingLiveCatError);

    await expect(
      smartlingTmsProvider.buildLiveCatFile({
        secretMaterial: "user:secret",
        externalProjectId: "proj-1",
        file: createSmartlingFile(),
        targetLocale: "fr-FR",
        canEditTranslations: true,
      }),
    ).rejects.toMatchObject({ code: "smartling_auth_invalid" });
  });
});
