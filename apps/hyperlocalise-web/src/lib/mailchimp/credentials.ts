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

import { createMailchimpClient, type MailchimpClient } from "./client";
import { fetchMailchimpOAuthApiBaseUrl } from "./oauth-metadata";
import { loadMailchimpPipesAccessToken, resolveMailchimpPipesWorkosUserId } from "./pipes";
import type { MailchimpSettingsError } from "./types";

export async function loadMailchimpAutomationClient(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  localUserId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Result<{ client: MailchimpClient; workosUserId: string }, MailchimpSettingsError>> {
  const workosUserId = await resolveMailchimpPipesWorkosUserId({
    workosUserId: input.workosUserId,
    localUserId: input.localUserId,
  });
  if (!workosUserId) {
    return err({
      code: "mailchimp_not_connected",
      message: "Connect Mailchimp in Integrations before using it.",
    });
  }

  const accessToken = await loadMailchimpPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId,
  });
  if (isErr(accessToken)) {
    return accessToken;
  }

  const baseUrl = await fetchMailchimpOAuthApiBaseUrl({
    accessToken: accessToken.value,
    fetchImpl: input.fetchImpl,
  });
  if (isErr(baseUrl)) {
    return baseUrl;
  }

  return ok({
    workosUserId,
    client: createMailchimpClient({
      accessToken: accessToken.value,
      baseUrl: baseUrl.value,
      fetchImpl: input.fetchImpl,
    }),
  });
}
