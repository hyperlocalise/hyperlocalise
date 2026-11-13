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
import type { GoSvcRequestOptions, WorkspaceResourceUsage } from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcBillingApi {
  constructor(private readonly request: GoSvcRequest) {}

  resourceUsage(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ resourceUsage: WorkspaceResourceUsage }>(
      orgPath(organizationSlug, "billing", "resource-usage"),
      options,
    );
  }
}
