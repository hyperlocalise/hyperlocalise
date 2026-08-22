/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { auth, type Oauth } from "@canva/user";

export const CANVA_OAUTH_SCOPES = new Set(["canva.localize", "offline_access"]);

let oauthClient: Oauth | null = null;

export function getCanvaOAuthClient(): Oauth {
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

export async function connectHyperlocalise(): Promise<"completed" | "aborted"> {
  const oauth = getCanvaOAuthClient();
  const result = await oauth.requestAuthorization({ scope: CANVA_OAUTH_SCOPES });
  return result.status;
}

export async function disconnectHyperlocalise(): Promise<void> {
  const oauth = getCanvaOAuthClient();
  await oauth.deauthorize();
}
