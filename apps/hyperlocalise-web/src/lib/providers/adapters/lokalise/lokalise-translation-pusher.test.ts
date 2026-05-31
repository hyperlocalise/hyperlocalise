import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pushLokaliseTranslations } from "./lokalise-translation-pusher";

describe("pushLokaliseTranslations", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("bulk updates approved translations with stable key ids", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/tasks/42")) {
        return new Response(
          JSON.stringify({
            task: {
              task_id: 42,
              title: "Homepage",
              status: "in_progress",
              task_type: "translation",
              languages: [{ language_iso: "fr", keys: [4242] }],
              source_language_iso: "en",
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/keys") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          keys: [
            {
              key_id: 4242,
              translations: [
                {
                  language_iso: "fr",
                  translation: "Bonjour",
                  is_unverified: false,
                  is_reviewed: true,
                },
              ],
            },
          ],
        });
        return new Response(JSON.stringify({ keys: [{ key_id: 4242 }] }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await pushLokaliseTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      externalJobId: "42",
      credential: {
        id: "cred-1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      project: {} as never,
      secretMaterial: "token",
      translations: [{ locale: "fr", externalStringId: "4242", key: "hello", text: "Bonjour" }],
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.asyncOperations).toEqual([
      expect.objectContaining({
        type: "lokalise_bulk_update_keys",
        status: "succeeded",
      }),
    ]);
  });

  it("records partial bulk update failures from response errors", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/tasks/42")) {
        return new Response(
          JSON.stringify({
            task: {
              task_id: 42,
              title: "Homepage",
              status: "in_progress",
              languages: [{ language_iso: "fr", keys: [4242, 9999] }],
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/keys") && init?.method === "PUT") {
        return new Response(
          JSON.stringify({
            keys: [{ key_id: 4242 }],
            errors: [{ message: "Key not found", key: { key_id: 9999 } }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await pushLokaliseTranslations({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      externalJobId: "42",
      credential: {
        id: "cred-1",
        baseUrl: "https://api.lokalise.test/api2",
      } as never,
      project: {} as never,
      secretMaterial: "token",
      translations: [
        { locale: "fr", externalStringId: "4242", key: "hello", text: "Bonjour" },
        { locale: "fr", externalStringId: "9999", key: "missing", text: "Échec" },
      ],
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({
        locale: "fr",
        message: "Key not found",
      }),
    ]);
    expect(result.asyncOperations).toEqual([
      expect.objectContaining({
        type: "lokalise_bulk_update_keys",
        status: "partial",
        keysUpdated: 1,
        keysFailed: 1,
      }),
    ]);
  });
});
