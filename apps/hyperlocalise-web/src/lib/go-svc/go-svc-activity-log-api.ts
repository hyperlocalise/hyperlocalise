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
  ActivityLogItem,
  ActivityLogQuery,
  GoSvcRecord,
  GoSvcRequestOptions,
} from "./go-svc-client.types";
import { orgPath, type GoSvcRequest } from "./go-svc-request";

export class GoSvcActivityLogApi {
  constructor(private readonly request: GoSvcRequest) {}

  list(organizationSlug: string, query: ActivityLogQuery = {}, options: GoSvcRequestOptions = {}) {
    return this.request.json<{
      activityLogs: ActivityLogItem[];
      actors: GoSvcRecord[];
      nextCursor?: string | null;
    }>(orgPath(organizationSlug, "activity-logs"), { query, ...options });
  }
}
