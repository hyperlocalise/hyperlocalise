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

import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { fetchMailchimpOAuthApiBaseUrl } from "./oauth-metadata";

export const MAILCHIMP_CREDENTIALS_INVALID = {
  code: "mailchimp_credentials_invalid" as const,
  message: "Mailchimp rejected this connection. Reconnect in Integrations and try again.",
};

export const MAILCHIMP_TEMPORARILY_UNAVAILABLE = {
  code: "mailchimp_temporarily_unavailable" as const,
  message: "Mailchimp did not accept the request. Wait a moment and try again.",
};

export type MailchimpPingError =
  | typeof MAILCHIMP_CREDENTIALS_INVALID
  | typeof MAILCHIMP_TEMPORARILY_UNAVAILABLE;

export async function pingMailchimpAccessToken(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<Result<true, MailchimpPingError>> {
  const baseUrl = await fetchMailchimpOAuthApiBaseUrl({
    accessToken: input.accessToken,
    fetchImpl: input.fetchImpl,
  });
  if (isErr(baseUrl)) {
    return baseUrl;
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${baseUrl.value}/ping`, {
      headers: {
        Authorization: `Bearer ${input.accessToken.trim()}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      return err(MAILCHIMP_CREDENTIALS_INVALID);
    }
    if (!response.ok) {
      return err(MAILCHIMP_TEMPORARILY_UNAVAILABLE);
    }
    return ok(true);
  } catch {
    return err(MAILCHIMP_TEMPORARILY_UNAVAILABLE);
  }
}
