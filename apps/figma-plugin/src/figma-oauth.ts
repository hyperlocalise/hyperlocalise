import { normalizeAppUrl } from "./settings";

export const FIGMA_OAUTH_CALLBACK_PATH = "/connect/figma/oauth/callback";
export const FIGMA_OAUTH_MESSAGE_TYPE = "hyperlocalise-figma-oauth";

export type FigmaOauthCallbackMessage = {
  type: typeof FIGMA_OAUTH_MESSAGE_TYPE;
  state: string;
  code?: string;
  error?: string;
  errorDescription?: string;
};

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

export function createOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
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

function basicAuthHeader(clientId: string): string {
  return `Basic ${btoa(`${clientId}:`)}`;
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
      Authorization: basicAuthHeader(input.clientId),
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
      Authorization: basicAuthHeader(input.clientId),
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

export function waitForFigmaOAuthCallback(
  expectedState: string,
  popup: Window,
): Promise<{ code: string } | { error: string; errorDescription?: string }> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => {
        cleanup();
        reject(new Error("OAuth sign-in timed out."));
      },
      15 * 60 * 1000,
    );

    const onMessage = (event: MessageEvent) => {
      if (event.source !== popup) {
        return;
      }
      const data = event.data as Partial<FigmaOauthCallbackMessage> | null;
      if (!data || data.type !== FIGMA_OAUTH_MESSAGE_TYPE || data.state !== expectedState) {
        return;
      }
      cleanup();
      if (data.code) {
        resolve({ code: data.code });
        return;
      }
      resolve({
        error: data.error ?? "access_denied",
        errorDescription: data.errorDescription,
      });
    };

    const pollClosed = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("OAuth sign-in was closed before it finished."));
      }
    }, 500);

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(pollClosed);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
  });
}
