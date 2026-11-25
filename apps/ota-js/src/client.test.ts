import { describe, expect, it, vi } from "vite-plus/test";

import { createOtaClient, MIN_POLL_INTERVAL_MS, type OtaClientOptions } from "./client";
import { OtaError } from "./errors";
import { createMemoryStorage } from "./storage";

const HASH = "50fb350641274ba88296f97dc7e3e0c3";

function manifest(timestamp: number, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    format: "json",
    files: ["/messages.json", "/checkout.json"],
    languages: ["fr-FR", "de-DE"],
    language_mapping: {},
    timestamp,
    content: {
      "fr-FR": ["/content/fr-FR/messages.json", "/content/fr-FR/checkout.json"],
      "de-DE": ["/content/de-DE/messages.json", "/content/de-DE/checkout.json"],
    },
    ...overrides,
  };
}

type Route = { status?: number; body?: unknown } | Error;

function fakeCdn(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const { origin, pathname } = new URL(url);
    const route = routes[`${origin}${pathname}`] ?? routes[pathname];
    if (route instanceof Error) {
      throw route;
    }
    if (!route) {
      return new Response("not found", { status: 404 });
    }
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
    return new Response(body, { status: route.status ?? 200 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, routes };
}

function fullRoutes(timestamp = 100): Record<string, Route> {
  return {
    [`/ota/${HASH}/manifest.json`]: { body: manifest(timestamp) },
    [`/ota/${HASH}/content/fr-FR/messages.json`]: { body: { hello: "Bonjour", bye: "Au revoir" } },
    [`/ota/${HASH}/content/fr-FR/checkout.json`]: { body: { "checkout.pay": "Payer" } },
    [`/ota/${HASH}/content/de-DE/messages.json`]: { body: { hello: "Hallo" } },
    [`/ota/${HASH}/content/de-DE/checkout.json`]: { body: {} },
  };
}

function setup(routes = fullRoutes(), options: Partial<OtaClientOptions> = {}) {
  const cdn = fakeCdn(routes);
  let clock = 1_000_000;
  const storage = options.storage ?? createMemoryStorage();
  const client = createOtaClient({
    hash: HASH,
    fetch: cdn.fetch,
    storage,
    now: () => clock,
    ...options,
  });
  return {
    client,
    cdn,
    storage,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("createOtaClient", () => {
  it("merges every file for a locale and appends the release timestamp", async () => {
    const { client, cdn } = setup();

    await expect(client.getMessages("fr-FR")).resolves.toEqual({
      hello: "Bonjour",
      bye: "Au revoir",
      "checkout.pay": "Payer",
    });
    expect(cdn.calls).toContain(
      `https://public-api.hyperlocalise.com/ota/${HASH}/content/fr-FR/messages.json?t=100`,
    );
  });

  it("filters by namespace and resolves language-only locales", async () => {
    const { client } = setup();

    await expect(client.getMessages("fr", { namespace: "checkout" })).resolves.toEqual({
      "checkout.pay": "Payer",
    });
    await expect(client.resolveLocale("de_AT")).resolves.toBe("de-DE");
  });

  it("reuses the manifest and content until the poll interval passes", async () => {
    const { client, cdn, advance } = setup();

    await client.getMessages("fr-FR");
    await client.getMessages("fr-FR");
    expect(cdn.calls).toHaveLength(3);

    advance(MIN_POLL_INTERVAL_MS);
    await client.getMessages("fr-FR");
    // Same timestamp: only the manifest is fetched again.
    expect(cdn.calls).toHaveLength(4);
  });

  it("dedupes concurrent manifest requests", async () => {
    const { client, cdn } = setup();

    await Promise.all([client.getManifest(), client.getManifest(), client.getLocales()]);
    expect(cdn.calls.filter((url) => url.includes("manifest.json"))).toHaveLength(1);
  });

  it("notifies subscribers and refetches content after a new release", async () => {
    const { client, cdn } = setup();
    const listener = vi.fn();
    client.subscribe(listener);

    await client.getMessages("fr-FR");
    cdn.routes[`/ota/${HASH}/manifest.json`] = { body: manifest(200) };
    cdn.routes[`/ota/${HASH}/content/fr-FR/messages.json`] = { body: { hello: "Salut" } };

    await expect(client.refresh()).resolves.toBe(true);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: 200, previousTimestamp: 100 }),
    );
    await expect(client.getMessages("fr-FR")).resolves.toMatchObject({ hello: "Salut" });
    expect(cdn.calls).toContain(
      `https://public-api.hyperlocalise.com/ota/${HASH}/content/fr-FR/messages.json?t=200`,
    );
  });

  it("serves the stored release offline across app starts", async () => {
    const storage = createMemoryStorage();
    await setup(fullRoutes(), { storage }).client.getMessages("fr-FR");

    const offline = new TypeError("fetch failed");
    const onError = vi.fn();
    const { client, advance } = setup(
      { [`/ota/${HASH}/manifest.json`]: offline },
      { storage, onError, fallbackBaseUrls: [] },
    );
    advance(MIN_POLL_INTERVAL_MS * 2);

    await expect(client.getMessages("fr-FR")).resolves.toMatchObject({ hello: "Bonjour" });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "network_error" }));
  });

  it("fails over to the API host when the public host is down", async () => {
    const routes = fullRoutes();
    routes[`https://public-api.hyperlocalise.com/ota/${HASH}/manifest.json`] = { status: 503 };
    routes[`https://api.hyperlocalise.com/ota/${HASH}/manifest.json`] = { body: manifest(100) };
    const { client, cdn } = setup(routes);

    await expect(client.getManifest()).resolves.toMatchObject({ timestamp: 100 });
    expect(cdn.calls[1]).toMatch(/^https:\/\/api\.hyperlocalise\.com\/ota\//);
  });

  it("returns bundled strings, with OTA strings on top", async () => {
    const { client } = setup(fullRoutes(), {
      fallbackMessages: { "fr-FR": { hello: "Bonjour (app)", onlyBundled: "Bundled" } },
    });

    await expect(client.getMessages("fr-FR")).resolves.toMatchObject({
      hello: "Bonjour",
      onlyBundled: "Bundled",
    });
  });

  it("drops the cache and falls back when the hash is revoked", async () => {
    const storage = createMemoryStorage();
    await setup(fullRoutes(), { storage }).client.getMessages("fr-FR");

    const { client, advance } = setup(
      {},
      { storage, fallbackMessages: { fr: { hello: "Bonjour (app)" } }, onError: () => {} },
    );
    advance(MIN_POLL_INTERVAL_MS);
    await expect(client.getMessages("fr-FR")).resolves.toEqual({ hello: "Bonjour (app)" });
    await expect(storage.getItem(`hlota:v1:${HASH}:manifest`)).toBeFalsy();
  });

  it("throws typed errors when nothing can be served", async () => {
    const { client } = setup({});

    const error = await client.getMessages("fr-FR").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OtaError);
    expect(error).toMatchObject({ code: "not_found", status: 404 });

    await expect(setup().client.getMessages("ja-JP")).rejects.toMatchObject({
      code: "unknown_locale",
    });
  });

  it("returns raw files for non-JSON formats", async () => {
    const routes: Record<string, Route> = {
      [`/ota/${HASH}/manifest.json`]: {
        body: manifest(100, {
          format: "ios-strings",
          languages: ["fr-FR"],
          content: { "fr-FR": ["/content/fr-FR/Localizable.strings"] },
        }),
      },
      [`/ota/${HASH}/content/fr-FR/Localizable.strings`]: { body: '"hello" = "Bonjour";\n' },
    };
    const { client } = setup(routes);

    await expect(client.getMessages("fr-FR")).rejects.toMatchObject({ code: "unsupported_format" });
    await expect(client.getContent("fr-FR")).resolves.toEqual([
      {
        path: "/content/fr-FR/Localizable.strings",
        namespace: "Localizable",
        body: '"hello" = "Bonjour";\n',
      },
    ]);
  });

  it("uses a custom S3 base URL without the /ota prefix", async () => {
    const routes: Record<string, Route> = {
      [`/${HASH}/manifest.json`]: { body: manifest(100) },
    };
    const { client, cdn } = setup(routes, { baseUrl: "https://cdn.example.com/" });

    await client.getManifest();
    expect(cdn.calls[0]).toMatch(
      new RegExp(`^https://cdn\\.example\\.com/${HASH}/manifest\\.json\\?t=`),
    );
  });

  it("clamps the poll interval and polls with startPolling", async () => {
    vi.useFakeTimers();
    try {
      const { client, cdn } = setup(fullRoutes(), { pollIntervalMs: 1000 });
      client.startPolling();
      await vi.advanceTimersByTimeAsync(1000);
      expect(cdn.calls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(MIN_POLL_INTERVAL_MS);
      expect(cdn.calls).toHaveLength(1);
      client.stopPolling();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an invalid hash", () => {
    expect(() => createOtaClient({ hash: "../x", fetch: vi.fn() })).toThrow(TypeError);
  });
});
