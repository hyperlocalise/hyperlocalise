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
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { GoSvcClient } from "./go-svc-client";

/** Background workflows cannot use a browser session. Keep signing in this server module. */
export function createGoSvcServerClient() {
  const secret = env.WORKOS_COOKIE_PASSWORD;
  if (!secret) throw new Error("Go service authentication is not configured");
  return new GoSvcClient({
    baseUrl: env.GO_SVC_URL,
    getServiceToken: () => createHmac("sha256", secret).update("go-svc-research").digest("hex"),
  });
}
