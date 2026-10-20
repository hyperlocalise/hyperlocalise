import { isRecord, readErrorMessage, readResponseJson, readString } from "./json";
import { normalizeAppUrl } from "./settings";

export const SANITY_OAUTH_CALLBACK_PATH = "/connect/sanity/oauth/callback";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createPkceVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function sanityOAuthRedirectUri(appUrl: string): string {
  return `${normalizeAppUrl(appUrl)}${SANITY_OAUTH_CALLBACK_PATH}`;
}

export type SanityIntegrationHealth = {
  ok: boolean;
  sanityOauthConfigured: boolean;
  sanityOauthClientId?: string;
};

function parseIntegrationHealth(value: unknown): SanityIntegrationHealth {
  if (!isRecord(value) || value.ok !== true) {
    return { ok: false, sanityOauthConfigured: false };
  }
  return {
    ok: true,
    sanityOauthConfigured: value.sanityOauthConfigured === true,
    sanityOauthClientId: readString(value.sanityOauthClientId),
  };
}

export async function fetchSanityIntegrationHealth(
  appUrl: string,
): Promise<SanityIntegrationHealth> {
  const response = await fetch(`${normalizeAppUrl(appUrl)}/api/integrations/sanity/health`);
  const payload = parseIntegrationHealth(await readResponseJson(response));
  if (!response.ok || !payload.ok) {
    return { ok: false, sanityOauthConfigured: false };
  }
  return payload;
}

export type SanityOauthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

export type SanityOauthHandoffKeys = {
  readKey: string;
  writeKey: string;
};

export type SanityOauthHandoffPollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "done"; code?: string; error?: string; errorDescription?: string };

function parseHandoffKeys(value: unknown): SanityOauthHandoffKeys | null {
  if (!isRecord(value)) {
    return null;
  }
  const readKey = readString(value.readKey);
  const writeKey = readString(value.writeKey);
  if (!readKey || !writeKey) {
    return null;
  }
  return { readKey, writeKey };
}

function parseHandoffPoll(value: unknown): SanityOauthHandoffPollResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.status === "pending") {
    return { status: "pending" };
  }
  if (value.status === "expired") {
    return { status: "expired" };
  }
  if (value.status === "done") {
    return {
      status: "done",
      code: readString(value.code),
      error: readString(value.error),
      errorDescription: readString(value.errorDescription),
    };
  }
  return null;
}

function parseTokenResponse(value: unknown): SanityOauthTokenResponse | null {
  if (!isRecord(value)) {
    return null;
  }
  const accessToken = readString(value.access_token);
  const refreshToken = readString(value.refresh_token);
  if (!accessToken || !refreshToken) {
    return null;
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: typeof value.expires_in === "number" ? value.expires_in : 0,
    token_type: readString(value.token_type) ?? "Bearer",
    scope: readString(value.scope) ?? "sanity",
  };
}

export async function createSanityOauthHandoff(appUrl: string): Promise<SanityOauthHandoffKeys> {
  const response = await fetch(`${normalizeAppUrl(appUrl)}/api/oauth/sanity/handoff`, {
    method: "POST",
  });
  const payload = await readResponseJson(response);
  const keys = parseHandoffKeys(payload);
  if (!response.ok || !keys) {
    throw new Error(readErrorMessage(payload) ?? "sanity_oauth_handoff_failed");
  }
  return keys;
}

export const SANITY_OAUTH_CANCELLED = "OAuth sign-in was cancelled.";

export function isSanityOauthCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === SANITY_OAUTH_CANCELLED;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error(SANITY_OAUTH_CANCELLED));
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new Error(SANITY_OAUTH_CANCELLED));
      },
      { once: true },
    );
  });
}

async function readHandoffPoll(input: {
  appUrl: string;
  readKey: string;
}): Promise<SanityOauthHandoffPollResult> {
  const response = await fetch(
    `${normalizeAppUrl(input.appUrl)}/api/oauth/sanity/handoff/${encodeURIComponent(input.readKey)}`,
  );
  const payload = parseHandoffPoll(await readResponseJson(response));
  if (!response.ok || !payload) {
    throw new Error("sanity_oauth_handoff_poll_failed");
  }
  return payload;
}

export async function pollSanityOauthHandoff(input: {
  appUrl: string;
  readKey: string;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ code: string } | { error: string; errorDescription?: string }> {
  const intervalMs = input.intervalMs ?? 2_000;
  const timeoutMs = input.timeoutMs ?? 15 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  const poll = async (): Promise<
    { code: string } | { error: string; errorDescription?: string }
  > => {
    if (input.signal?.aborted) {
      return readFinalHandoffOrCancel(input);
    }
    if (Date.now() >= deadline) {
      throw new Error("OAuth sign-in timed out.");
    }

    const payload = await readHandoffPoll({
      appUrl: input.appUrl,
      readKey: input.readKey,
    });

    if (payload.status === "expired") {
      throw new Error("OAuth sign-in timed out.");
    }

    if (payload.status === "done") {
      if (payload.code) {
        return { code: payload.code };
      }
      return {
        error: payload.error ?? "access_denied",
        errorDescription: payload.errorDescription,
      };
    }

    try {
      await delay(intervalMs, input.signal);
    } catch {
      return readFinalHandoffOrCancel(input);
    }
    return poll();
  };

  return poll();
}

async function readFinalHandoffOrCancel(input: {
  appUrl: string;
  readKey: string;
}): Promise<{ code: string } | { error: string; errorDescription?: string }> {
  try {
    const payload = await readHandoffPoll({
      appUrl: input.appUrl,
      readKey: input.readKey,
    });
    if (payload.status === "done") {
      if (payload.code) {
        return { code: payload.code };
      }
      return {
        error: payload.error ?? "access_denied",
        errorDescription: payload.errorDescription,
      };
    }
  } catch {
    // The popup closed before the last poll could finish.
  }
  throw new Error(SANITY_OAUTH_CANCELLED);
}

export async function exchangeSanityAuthorizationCode(input: {
  appUrl: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<SanityOauthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: input.clientId,
  });
  const response = await fetch(`${normalizeAppUrl(input.appUrl)}/api/oauth/sanity/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await readResponseJson(response);
  const tokens = parseTokenResponse(payload);
  if (!response.ok || !tokens) {
    throw new Error(readErrorMessage(payload) ?? "sanity_oauth_token_failed");
  }
  return tokens;
}

export async function refreshSanityOAuthSession(input: {
  appUrl: string;
  refreshToken: string | null | undefined;
}): Promise<SanityOauthTokenResponse | null> {
  const refreshToken = input.refreshToken?.trim();
  if (!refreshToken) {
    return null;
  }

  const health = await fetchSanityIntegrationHealth(input.appUrl);
  const clientId = health.sanityOauthClientId?.trim();
  if (!clientId) {
    return null;
  }

  try {
    return await refreshSanityAccessToken({
      appUrl: input.appUrl,
      clientId,
      refreshToken,
    });
  } catch {
    return null;
  }
}

export async function refreshSanityAccessToken(input: {
  appUrl: string;
  clientId: string;
  refreshToken: string;
}): Promise<SanityOauthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
  });
  const response = await fetch(`${normalizeAppUrl(input.appUrl)}/api/oauth/sanity/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await readResponseJson(response);
  const tokens = parseTokenResponse(payload);
  if (!response.ok || !tokens) {
    throw new Error(readErrorMessage(payload) ?? "sanity_oauth_refresh_failed");
  }
  return tokens;
}

export async function runSanityOAuthHandoff(input: {
  appUrl: string;
  clientId: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const handoff = await createSanityOauthHandoff(input.appUrl);
  const verifier = createPkceVerifier();
  const codeChallenge = await createPkceChallenge(verifier);
  const redirectUri = sanityOAuthRedirectUri(input.appUrl);
  const authorizeUrl = buildSanityAuthorizeUrl({
    appUrl: input.appUrl,
    clientId: input.clientId,
    redirectUri,
    codeChallenge,
    state: handoff.writeKey,
  });

  const width = 520;
  const height = 720;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open(
    authorizeUrl,
    "hyperlocalise_sanity_oauth",
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );
  if (!popup) {
    throw new Error("Allow pop-ups for this Studio to connect with Hyperlocalise.");
  }

  const controller = new AbortController();
  const closedWatch = window.setInterval(() => {
    if (popup.closed) {
      controller.abort();
    }
  }, 400);

  try {
    const callback = await pollSanityOauthHandoff({
      appUrl: input.appUrl,
      readKey: handoff.readKey,
      signal: controller.signal,
    });
    if (!popup.closed) {
      popup.close();
    }
    if ("error" in callback) {
      throw new Error(callback.errorDescription ?? SANITY_OAUTH_CANCELLED);
    }

    const tokens = await exchangeSanityAuthorizationCode({
      appUrl: input.appUrl,
      clientId: input.clientId,
      code: callback.code,
      codeVerifier: verifier,
      redirectUri,
    });

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
  } finally {
    window.clearInterval(closedWatch);
    if (!popup.closed) {
      popup.close();
    }
  }
}

export function buildSanityAuthorizeUrl(input: {
  appUrl: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(`${normalizeAppUrl(input.appUrl)}/api/oauth/sanity/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "sanity");
  url.searchParams.set("state", input.state);
  url.searchParams.set("studio_origin", window.location.origin);
  return url.href;
}
