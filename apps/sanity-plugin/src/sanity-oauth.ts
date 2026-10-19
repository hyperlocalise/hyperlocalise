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

export async function fetchSanityIntegrationHealth(appUrl: string): Promise<SanityIntegrationHealth> {
  const response = await fetch(`${normalizeAppUrl(appUrl)}/api/integrations/sanity/health`);
  const payload = (await response.json().catch(() => null)) as SanityIntegrationHealth | null;
  if (!response.ok || !payload?.ok) {
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

export async function createSanityOauthHandoff(appUrl: string): Promise<SanityOauthHandoffKeys> {
  const response = await fetch(`${normalizeAppUrl(appUrl)}/api/oauth/sanity/handoff`, {
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | (SanityOauthHandoffKeys & { error?: string })
    | null;
  if (!response.ok || !payload?.readKey || !payload.writeKey) {
    throw new Error(payload?.error ?? "sanity_oauth_handoff_failed");
  }
  return { readKey: payload.readKey, writeKey: payload.writeKey };
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
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (input.signal?.aborted) {
      throw new Error("OAuth sign-in was cancelled.");
    }

    const response = await fetch(
      `${normalizeAppUrl(input.appUrl)}/api/oauth/sanity/handoff/${encodeURIComponent(input.readKey)}`,
    );
    const payload = (await response.json().catch(() => null)) as SanityOauthHandoffPollResult | null;
    if (!response.ok || !payload) {
      throw new Error("sanity_oauth_handoff_poll_failed");
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
  const payload = (await response.json().catch(() => null)) as
    | (SanityOauthTokenResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token) {
    throw new Error(payload?.error ?? "sanity_oauth_token_failed");
  }
  return payload;
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
  const payload = (await response.json().catch(() => null)) as
    | (SanityOauthTokenResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.access_token || !payload.refresh_token) {
    throw new Error(payload?.error ?? "sanity_oauth_refresh_failed");
  }
  return payload;
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

  const popup = window.open(authorizeUrl, "hyperlocalise_sanity_oauth", "width=520,height=720");
  if (!popup) {
    throw new Error("Allow pop-ups for this Studio to connect with Hyperlocalise.");
  }

  const callback = await pollSanityOauthHandoff({
    appUrl: input.appUrl,
    readKey: handoff.readKey,
  });
  popup.close();
  if ("error" in callback) {
    throw new Error(callback.errorDescription ?? "Hyperlocalise sign-in was cancelled.");
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
  return url.href;
}
