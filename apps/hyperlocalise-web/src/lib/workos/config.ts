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
import { env } from "@/lib/env";

export type WorkosAuthKitConfig = {
  clientId: string;
  apiKey: string;
  redirectUri: string;
  cookiePassword: string;
};

export function getWorkosAuthKitConfig(): WorkosAuthKitConfig | null {
  const redirectUri = env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? env.WORKOS_REDIRECT_URI;

  if (!env.WORKOS_CLIENT_ID || !env.WORKOS_API_KEY || !redirectUri || !env.WORKOS_COOKIE_PASSWORD) {
    return null;
  }

  return {
    clientId: env.WORKOS_CLIENT_ID,
    apiKey: env.WORKOS_API_KEY,
    redirectUri,
    cookiePassword: env.WORKOS_COOKIE_PASSWORD,
  };
}
