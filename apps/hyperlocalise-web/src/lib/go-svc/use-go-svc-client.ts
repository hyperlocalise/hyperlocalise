"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMemo } from "react";
import { useAuth, useAccessToken } from "@workos-inc/authkit-nextjs/components";

import { env } from "@/lib/env";

import { GoSvcClient } from "./go-svc-client";

export function useGoSvcClient() {
  const { user } = useAuth();
  const { getAccessToken, loading: authLoading, accessToken } = useAccessToken();
  const client = useMemo(
    () =>
      new GoSvcClient({
        baseUrl: env.NEXT_PUBLIC_API_BASE_URL,
        getAccessToken,
      }),
    [getAccessToken],
  );
  const hasAccessToken = Boolean(String(accessToken ?? "").trim());
  // AuthKit can clear `loading` before a bearer token is readable; do not call
  // go-svc until the session token is present for a signed-in user.
  const loading = authLoading || (Boolean(user) && !hasAccessToken);

  return { client, loading, accessToken };
}
