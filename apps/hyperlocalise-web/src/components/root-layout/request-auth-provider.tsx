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
import { Suspense, type ReactNode } from "react";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { withAuth } from "@/lib/workos/server-auth";

type RequestAuthProviderProps = {
  children: ReactNode;
};

/** Seeds AuthKit with the request session. Reads cookies, so it defers to request time. */
export function RequestAuthProvider({ children }: RequestAuthProviderProps) {
  // Keep route children out of the fallback. Including them would prerender
  // uncached page data (cookies, headers, auth) into the static shell.
  return (
    <Suspense fallback={null}>
      <RequestAuthProviderContent>{children}</RequestAuthProviderContent>
    </Suspense>
  );
}

async function RequestAuthProviderContent({ children }: RequestAuthProviderProps) {
  const { accessToken: _accessToken, ...initialAuth } = await withAuth();

  return <AuthKitProvider initialAuth={initialAuth}>{children}</AuthKitProvider>;
}
