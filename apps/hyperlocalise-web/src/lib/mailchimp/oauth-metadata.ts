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

import {
  MAILCHIMP_CREDENTIALS_INVALID,
  MAILCHIMP_TEMPORARILY_UNAVAILABLE,
  type MailchimpPingError,
} from "./ping";

const MAILCHIMP_OAUTH_METADATA_URL = "https://login.mailchimp.com/oauth2/metadata";

type MailchimpOAuthMetadata = {
  api_endpoint?: string;
};

export async function fetchMailchimpOAuthApiBaseUrl(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<Result<string, MailchimpPingError>> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    return err(MAILCHIMP_CREDENTIALS_INVALID);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(MAILCHIMP_OAUTH_METADATA_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      return err(MAILCHIMP_CREDENTIALS_INVALID);
    }
    if (!response.ok) {
      return err(MAILCHIMP_TEMPORARILY_UNAVAILABLE);
    }
    const body = (await response.json()) as MailchimpOAuthMetadata;
    const apiEndpoint = body.api_endpoint?.trim().replace(/\/$/, "");
    if (!apiEndpoint) {
      return err(MAILCHIMP_CREDENTIALS_INVALID);
    }
    return ok(apiEndpoint);
  } catch {
    return err(MAILCHIMP_TEMPORARILY_UNAVAILABLE);
  }
}
