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
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { resolveIterableBaseUrl, type IterableRegion } from "./constants";

export const ITERABLE_CREDENTIALS_INVALID = {
  code: "iterable_credentials_invalid" as const,
  message: "Iterable rejected this API key for that data center. Check both and try again.",
};

export const ITERABLE_REGION_UNREACHABLE = {
  code: "iterable_region_unreachable" as const,
  message:
    "Could not reach that Iterable data center. Confirm the region matches the project that issued the key.",
};

export const ITERABLE_TEMPORARILY_UNAVAILABLE = {
  code: "iterable_temporarily_unavailable" as const,
  message: "Iterable did not accept the request. Wait a moment and try saving again.",
};

export type IterablePingError =
  | typeof ITERABLE_CREDENTIALS_INVALID
  | typeof ITERABLE_REGION_UNREACHABLE
  | typeof ITERABLE_TEMPORARILY_UNAVAILABLE;

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

export async function pingIterableCredentials(input: {
  apiKey: string;
  region: IterableRegion;
  fetchImpl?: typeof fetch;
}): Promise<Result<true, IterablePingError>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(
      `${resolveIterableBaseUrl(input.region)}/api/templates?page=1&pageSize=1`,
      {
        headers: {
          "Api-Key": input.apiKey.trim(),
          Accept: "application/json",
        },
      },
    );
  } catch {
    return err(ITERABLE_REGION_UNREACHABLE);
  }

  if (response.status >= 200 && response.status < 300) {
    return ok(true);
  }
  if (isAuthFailure(response.status)) {
    return err(ITERABLE_CREDENTIALS_INVALID);
  }
  if (response.status === 429 || response.status >= 500) {
    return err(ITERABLE_TEMPORARILY_UNAVAILABLE);
  }
  return err(ITERABLE_REGION_UNREACHABLE);
}
