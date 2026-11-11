import { normalizeAppUrl } from "./settings";

export const FIGMA_OAUTH_CALLBACK_PATH = "/connect/figma/oauth/callback";

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

export function figmaOAuthRedirectUri(appUrl: string): string {
  return `${normalizeAppUrl(appUrl)}${FIGMA_OAUTH_CALLBACK_PATH}`;
}

export type FigmaIntegrationHealth = {
  ok: boolean;
  figmaOauthConfigured: boolean;
  figmaOauthClientId?: string;
};

export async function fetchFigmaIntegrationHealth(appUrl: string): Promise<FigmaIntegrationHealth> {
  const response = await fetch(`${normalizeAppUrl(appUrl)}/api/integrations/figma/health`);
  const payload = (await response.json().catch(() => null)) as FigmaIntegrationHealth | null;
  if (!response.ok || !payload?.ok) {
    return { ok: false, figmaOauthConfigured: false };
  }
  return payload;
}

export type FigmaOauthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

export type FigmaOauthHandoffKeys = {
  readKey: string;
  writeKey: string;
};

export type FigmaOauthHandoffPollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "done"; code?: string; error?: string; errorDescription?: string };

export async function createFigmaOauthHandoff(appUrl: string): Promise<FigmaOauthHandoffKeys> {
  const response = await fetch(`${normalizeAppUrl(appUrl)}/api/oauth/figma/handoff`, {
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | (FigmaOauthHandoffKeys & { error?: string })
    | null;
  if (!response.ok || !payload?.readKey || !payload.writeKey) {
    throw new Error(payload?.error ?? "figma_oauth_handoff_failed");
  }
  return { readKey: payload.readKey, writeKey: payload.writeKey };
}

export async function pollFigmaOauthHandoff(input: {
  appUrl: string;
  readKey: string;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ code: string } | { error: string; errorDescription?: string }> {
  const intervalMs = input.intervalMs ?? 2_000;
  const timeoutMs = input.timeoutMs ?? 15 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (input.signal?.aborted) {
      throw new Error("OAuth sign-in was cancelled.");
    }

    const response = await fetch(
      `${normalizeAppUrl(input.appUrl)}/api/oauth/figma/handoff/${encodeURIComponent(input.readKey)}`,
    );
    const payload = (await response.json().catch(() => null)) as FigmaOauthHandoffPollResult | null;
    if (!response.ok || !payload) {
      throw new Error("figma_oauth_handoff_poll_failed");
    }

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

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, intervalMs);
      input.signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new Error("OAuth sign-in was cancelled."));
        },
        { once: true },
      );
    });
  }

  throw new Error("OAuth sign-in timed out.");
}

export async function exchangeFigmaAuthorizationCode(input: {
  appUrl: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<FigmaOauthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: input.clientId,
  });
  const response = await fetch(`${normalizeAppUrl(input.appUrl)}/api/oauth/figma/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => null)) as
    | (FigmaOauthTokenResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token) {
    throw new Error(payload?.error ?? "figma_oauth_token_failed");
  }
  return payload;
}

export async function refreshFigmaOAuthSession(input: {
  appUrl: string;
  refreshToken: string | null | undefined;
}): Promise<FigmaOauthTokenResponse | null> {
  const refreshToken = input.refreshToken?.trim();
  if (!refreshToken) {
    return null;
  }

  const health = await fetchFigmaIntegrationHealth(input.appUrl);
  const clientId = health.figmaOauthClientId?.trim();
  if (!clientId) {
    return null;
  }

  try {
    return await refreshFigmaAccessToken({
      appUrl: input.appUrl,
      clientId,
      refreshToken,
    });
  } catch {
    return null;
  }
}

export async function refreshFigmaAccessToken(input: {
  appUrl: string;
  clientId: string;
  refreshToken: string;
}): Promise<FigmaOauthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
  });
  const response = await fetch(`${normalizeAppUrl(input.appUrl)}/api/oauth/figma/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => null)) as
    | (FigmaOauthTokenResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token) {
    throw new Error(payload?.error ?? "figma_oauth_refresh_failed");
  }
  return payload;
}

export function buildFigmaAuthorizeUrl(input: {
  appUrl: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(`${normalizeAppUrl(input.appUrl)}/api/oauth/figma/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "figma");
  url.searchParams.set("state", input.state);
  return url.href;
}
