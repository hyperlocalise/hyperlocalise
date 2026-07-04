import { auth } from "@canva/user";

export const CANVA_OAUTH_SCOPES = new Set(["canva.localize", "offline_access"]);

let oauthClient: ReturnType<typeof auth.initOauth> | null = null;

export function getCanvaOAuthClient() {
  if (!oauthClient) {
    oauthClient = auth.initOauth();
  }
  return oauthClient;
}

export async function getHyperlocaliseAccessToken(): Promise<string | null> {
  const oauth = getCanvaOAuthClient();
  const result = await oauth.getAccessToken({ scope: CANVA_OAUTH_SCOPES });
  return result?.token ?? null;
}

export async function connectHyperlocalise(): Promise<"completed" | "denied" | "error"> {
  const oauth = getCanvaOAuthClient();
  const result = await oauth.requestAuthorization({ scope: CANVA_OAUTH_SCOPES });
  return result.status;
}

export async function disconnectHyperlocalise(): Promise<void> {
  const oauth = getCanvaOAuthClient();
  await oauth.deauthorize();
}
