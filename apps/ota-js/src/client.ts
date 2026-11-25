import { OtaError } from "./errors";
import { resolveLocale } from "./locale";
import {
  namespaceFromPath,
  parseJsonMessages,
  parseManifest,
  type OtaManifest,
  type OtaMessages,
} from "./manifest";
import { createLocalStorage, readJson, writeJson, type OtaStorage } from "./storage";

export const DEFAULT_BASE_URL = "https://public-api.hyperlocalise.com/ota";
export const DEFAULT_FALLBACK_BASE_URLS: readonly string[] = ["https://api.hyperlocalise.com/ota"];
/** The CDN caches for an hour; polling faster than this only adds load. */
export const MIN_POLL_INTERVAL_MS = 15 * 60 * 1000;
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface OtaClientOptions {
  /** The distribution's 32-character public hash from Settings → CDN. */
  hash: string;
  /**
   * URL in front of the hash. Defaults to the Hyperlocalise CDN. For a custom
   * S3 destination, pass its public base URL (for example
   * `https://cdn.example.com`).
   */
  baseUrl?: string;
  /**
   * Tried in order when `baseUrl` is unreachable or returns a 5xx. Defaults to
   * the Hyperlocalise API host when `baseUrl` is not set, otherwise none.
   */
  fallbackBaseUrls?: readonly string[];
  /** Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /**
   * Keeps the last release for offline starts. Defaults to `localStorage` in
   * browsers and memory elsewhere. Pass AsyncStorage in React Native.
   */
  storage?: OtaStorage;
  /** How long a manifest is reused, and the polling interval. Minimum 15 minutes. */
  pollIntervalMs?: number;
  /** Per-request timeout. Defaults to 10 seconds. */
  timeoutMs?: number;
  /**
   * Strings bundled with the app, by locale. Used when OTA is unreachable and
   * under OTA strings for keys the release does not have.
   */
  fallbackMessages?: Readonly<Record<string, OtaMessages>>;
  /** Called for errors the client recovers from (stale cache or fallback served). */
  onError?: (error: OtaError) => void;
  /** Overridable clock for tests. */
  now?: () => number;
}

export interface OtaChangeEvent {
  timestamp: number;
  previousTimestamp: number;
  manifest: OtaManifest;
}

export interface OtaContentFile {
  path: string;
  namespace: string;
  body: string;
}

export interface GetMessagesOptions {
  /** Only files with this basename (`messages` for `/messages.json`). */
  namespace?: string;
}

export interface OtaClient {
  readonly hash: string;
  getManifest(options?: { force?: boolean }): Promise<OtaManifest>;
  getLocales(): Promise<string[]>;
  resolveLocale(locale: string): Promise<string | undefined>;
  getMessages(locale: string, options?: GetMessagesOptions): Promise<OtaMessages>;
  getContent(locale: string): Promise<OtaContentFile[]>;
  /** Fetches the manifest now. Resolves `true` when a new release was found. */
  refresh(): Promise<boolean>;
  subscribe(listener: (event: OtaChangeEvent) => void): () => void;
  startPolling(): void;
  stopPolling(): void;
}

interface StoredManifest {
  manifest: OtaManifest;
  fetchedAt: number;
}

interface StoredContent {
  timestamp: number;
  body: string;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function toOtaError(error: unknown, url: string): OtaError {
  if (error instanceof OtaError) {
    return error;
  }
  return new OtaError("network_error", `Could not reach ${url}`, { url, cause: error });
}

function isRetryable(error: OtaError): boolean {
  return (
    error.code === "network_error" ||
    error.code === "timeout" ||
    (error.code === "http_error" && (error.status ?? 0) >= 500)
  );
}

export function createOtaClient(options: OtaClientOptions): OtaClient {
  const hash = options.hash.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(hash)) {
    throw new TypeError("createOtaClient: `hash` must be the distribution's public hash");
  }

  const baseUrls = [
    trimSlash(options.baseUrl ?? DEFAULT_BASE_URL),
    ...(options.fallbackBaseUrls ?? (options.baseUrl ? [] : DEFAULT_FALLBACK_BASE_URLS)).map(
      trimSlash,
    ),
  ];
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    throw new TypeError("createOtaClient: no global fetch; pass `fetch` in options");
  }
  const storage = options.storage ?? createLocalStorage();
  const pollIntervalMs = Math.max(
    options.pollIntervalMs ?? MIN_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS,
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fallbackMessages = options.fallbackMessages ?? {};
  const now = options.now ?? Date.now;
  const report = (error: OtaError) => options.onError?.(error);

  const manifestKey = `hlota:v1:${hash}:manifest`;
  const contentKey = (path: string) => `hlota:v1:${hash}:content:${path}`;

  let current: StoredManifest | undefined;
  let restored = false;
  let manifestRequest: Promise<OtaManifest> | undefined;
  const contentRequests = new Map<string, Promise<string>>();
  const listeners = new Set<(event: OtaChangeEvent) => void>();
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  async function request(path: string, query: string): Promise<string> {
    let lastError: OtaError | undefined;
    for (const base of baseUrls) {
      const url = `${base}/${hash}${path}?${query}`;
      try {
        return await requestOnce(url);
      } catch (error) {
        lastError = toOtaError(error, url);
        if (!isRetryable(lastError)) {
          throw lastError;
        }
      }
    }
    throw lastError ?? new OtaError("network_error", "No OTA base URL configured");
  }

  async function requestOnce(url: string): Promise<string> {
    const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "GET", signal: controller?.signal });
      if (response.status === 404) {
        throw new OtaError("not_found", "OTA distribution not found or revoked", {
          status: 404,
          url,
        });
      }
      if (!response.ok) {
        throw new OtaError("http_error", `OTA request failed with ${response.status}`, {
          status: response.status,
          url,
        });
      }
      return await response.text();
    } catch (error) {
      if (timedOut) {
        throw new OtaError("timeout", `OTA request timed out after ${timeoutMs}ms`, {
          url,
          cause: error,
        });
      }
      throw toOtaError(error, url);
    } finally {
      clearTimeout(timer);
    }
  }

  async function restore(): Promise<void> {
    if (restored) {
      return;
    }
    restored = true;
    const stored = await readJson<StoredManifest>(storage, manifestKey);
    if (!current && stored) {
      try {
        current = { manifest: parseManifest(stored.manifest), fetchedAt: stored.fetchedAt };
      } catch {
        await storage.removeItem(manifestKey);
      }
    }
  }

  async function forget(): Promise<void> {
    const paths = current ? Object.values(current.manifest.content).flat() : [];
    current = undefined;
    await Promise.all(
      [manifestKey, ...paths.map(contentKey)].map((key) => storage.removeItem(key)),
    );
  }

  async function fetchManifest(): Promise<OtaManifest> {
    // Bucketed so clients share CDN cache entries while still seeing a
    // release within one poll interval of it going out.
    const bucket = Math.floor(now() / pollIntervalMs);
    const body = await request("/manifest.json", `t=${bucket}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new OtaError("invalid_manifest", "OTA manifest is not valid JSON", { cause: error });
    }
    const manifest = parseManifest(parsed);
    const previous = current?.manifest;
    current = { manifest, fetchedAt: now() };
    await writeJson(storage, manifestKey, current);
    if (previous && previous.timestamp !== manifest.timestamp) {
      const event = {
        timestamp: manifest.timestamp,
        previousTimestamp: previous.timestamp,
        manifest,
      };
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // A broken listener must not stop the others.
        }
      }
    }
    return manifest;
  }

  async function getManifest({ force = false }: { force?: boolean } = {}): Promise<OtaManifest> {
    await restore();
    if (!force && current && now() - current.fetchedAt < pollIntervalMs) {
      return current.manifest;
    }
    manifestRequest ??= fetchManifest().finally(() => {
      manifestRequest = undefined;
    });
    try {
      return await manifestRequest;
    } catch (error) {
      const otaError = toOtaError(error, "manifest");
      if (otaError.code === "not_found") {
        await forget();
        throw otaError;
      }
      if (current) {
        report(otaError);
        return current.manifest;
      }
      throw otaError;
    }
  }

  async function loadFile(path: string, timestamp: number): Promise<string> {
    const key = contentKey(path);
    const stored = await readJson<StoredContent>(storage, key);
    if (stored && stored.timestamp === timestamp) {
      return stored.body;
    }
    const inflightKey = `${path}@${timestamp}`;
    let pending = contentRequests.get(inflightKey);
    if (!pending) {
      pending = request(path, `t=${timestamp}`)
        .then(async (body) => {
          await writeJson(storage, key, { timestamp, body } satisfies StoredContent);
          return body;
        })
        .catch((error: unknown) => {
          const otaError = toOtaError(error, path);
          // An older release beats no strings at all.
          if (stored && otaError.code !== "not_found") {
            report(otaError);
            return stored.body;
          }
          throw otaError;
        })
        .finally(() => {
          contentRequests.delete(inflightKey);
        });
      contentRequests.set(inflightKey, pending);
    }
    return pending;
  }

  async function getContent(locale: string): Promise<OtaContentFile[]> {
    const manifest = await getManifest();
    const resolved = resolveLocale(manifest, locale);
    if (!resolved) {
      throw new OtaError("unknown_locale", `Locale ${locale} is not in this distribution`);
    }
    const paths = manifest.content[resolved] ?? [];
    return Promise.all(
      paths.map(async (path) => ({
        path,
        namespace: namespaceFromPath(path),
        body: await loadFile(path, manifest.timestamp),
      })),
    );
  }

  function fallbackFor(locale: string): OtaMessages | undefined {
    if (fallbackMessages[locale]) {
      return fallbackMessages[locale];
    }
    const language = locale.split(/[-_]/)[0];
    const key = Object.keys(fallbackMessages).find(
      (candidate) => candidate.split(/[-_]/)[0] === language,
    );
    return key ? fallbackMessages[key] : undefined;
  }

  async function getMessages(
    locale: string,
    { namespace }: GetMessagesOptions = {},
  ): Promise<OtaMessages> {
    const fallback = fallbackFor(locale);
    let files: OtaContentFile[];
    try {
      const manifest = await getManifest();
      if (manifest.format !== "json") {
        throw new OtaError(
          "unsupported_format",
          `getMessages reads the json format; this distribution is ${manifest.format}. Use getContent.`,
        );
      }
      files = await getContent(locale);
    } catch (error) {
      const otaError = toOtaError(error, "content");
      if (fallback && otaError.code !== "unsupported_format") {
        report(otaError);
        return { ...fallback };
      }
      throw otaError;
    }

    const messages: OtaMessages = { ...fallback };
    for (const file of files) {
      if (namespace !== undefined && file.namespace !== namespace) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(file.body);
      } catch (error) {
        throw new OtaError("invalid_content", `OTA file ${file.path} is not valid JSON`, {
          cause: error,
        });
      }
      Object.assign(messages, parseJsonMessages(parsed, file.path));
    }
    return messages;
  }

  return {
    hash,
    getManifest,
    async getLocales() {
      return [...(await getManifest()).languages];
    },
    async resolveLocale(locale) {
      return resolveLocale(await getManifest(), locale);
    },
    getMessages,
    getContent,
    async refresh() {
      await restore();
      const before = current?.manifest.timestamp;
      const manifest = await getManifest({ force: true });
      return before !== undefined && before !== manifest.timestamp;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startPolling() {
      if (pollTimer) {
        return;
      }
      pollTimer = setInterval(() => {
        getManifest({ force: true }).catch((error: unknown) =>
          report(toOtaError(error, "manifest")),
        );
      }, pollIntervalMs);
      // Do not keep Node processes alive just to poll.
      (pollTimer as { unref?: () => void }).unref?.();
    },
    stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },
  };
}
