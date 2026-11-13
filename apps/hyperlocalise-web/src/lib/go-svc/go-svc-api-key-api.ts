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
import type {
  ApiKeySummary,
  CreateApiKeyBody,
  CreatedApiKey,
  GoSvcRequestOptions,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcApiKeyApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ apiKeys: ApiKeySummary[] }>(
      orgPath(organizationSlug, "api-keys"),
      options,
    );
  }

  create(organizationSlug: string, body: CreateApiKeyBody, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ apiKey: CreatedApiKey }>(orgPath(organizationSlug, "api-keys"), {
      method: "POST",
      body,
      ...options,
    });
  }

  revoke(organizationSlug: string, apiKeyId: string, options: GoSvcRequestOptions = {}) {
    return this.request.empty(orgPath(organizationSlug, "api-keys", apiKeyId), {
      method: "DELETE",
      ...options,
    });
  }
}
