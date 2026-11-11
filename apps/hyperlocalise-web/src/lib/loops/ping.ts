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

import { LOOPS_API_BASE_URL } from "./constants";

export const LOOPS_CREDENTIALS_INVALID = {
  code: "loops_credentials_invalid" as const,
  message: "Loops rejected this API key. Check the key and try again.",
};

export const LOOPS_TEMPORARILY_UNAVAILABLE = {
  code: "loops_temporarily_unavailable" as const,
  message: "Loops did not accept the request. Wait a moment and try saving again.",
};

export type LoopsPingError =
  | typeof LOOPS_CREDENTIALS_INVALID
  | typeof LOOPS_TEMPORARILY_UNAVAILABLE;

export async function pingLoopsCredentials(input: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<Result<true, LoopsPingError>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${LOOPS_API_BASE_URL}/api-key`, {
      headers: {
        Authorization: `Bearer ${input.apiKey.trim()}`,
        Accept: "application/json",
      },
    });
    if (response.status >= 200 && response.status < 300) {
      return ok(true);
    }
    if (response.status === 401 || response.status === 403) {
      return err(LOOPS_CREDENTIALS_INVALID);
    }
    if (response.status === 429 || response.status >= 500) {
      return err(LOOPS_TEMPORARILY_UNAVAILABLE);
    }
    return err(LOOPS_CREDENTIALS_INVALID);
  } catch {
    return err(LOOPS_TEMPORARILY_UNAVAILABLE);
  }
}
