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
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const GO_SVC_SERVICE_TOKEN_HEADER = "X-Go-Svc-Research-Token";
export const GO_SVC_SERVICE_TOKEN_MESSAGE = "go-svc-research";

const COMPARE_KEY = Buffer.alloc(32);

export function mintGoSvcServiceToken(cookiePassword: string) {
  return createHmac("sha256", cookiePassword).update(GO_SVC_SERVICE_TOKEN_MESSAGE).digest("hex");
}

function tokensMatch(provided: string, expected: string) {
  const providedHmac = createHmac("sha256", COMPARE_KEY).update(provided).digest();
  const expectedHmac = createHmac("sha256", COMPARE_KEY).update(expected).digest();
  return timingSafeEqual(providedHmac, expectedHmac);
}

export function verifyGoSvcServiceToken(request: Request) {
  const expectedSecret = env.WORKOS_COOKIE_PASSWORD;
  if (!expectedSecret) {
    return { ok: false as const, reason: "misconfigured" as const };
  }

  const provided = request.headers.get(GO_SVC_SERVICE_TOKEN_HEADER)?.trim() ?? "";
  const expected = mintGoSvcServiceToken(expectedSecret);
  if (!provided || !tokensMatch(provided, expected)) {
    return { ok: false as const, reason: "unauthorized" as const };
  }

  return { ok: true as const };
}
