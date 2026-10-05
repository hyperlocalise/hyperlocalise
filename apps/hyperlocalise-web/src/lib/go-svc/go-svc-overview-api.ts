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
  OverviewActivityItem,
  OverviewAutomationItem,
  OverviewBoardItem,
  OverviewProjectItem,
  WorkspaceOverviewSnapshot,
} from "@/lib/workspace/overview-snapshot-model";

import type { GoSvcRequestOptions } from "./go-svc-client.types";
import { orgPath, type GoSvcJsonRequest, type GoSvcRequest } from "./go-svc-request";

export class GoSvcOverviewApi {
  constructor(private readonly request: GoSvcRequest) {}

  metrics(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ metrics: WorkspaceOverviewSnapshot["metrics"] }>(
      orgPath(organizationSlug, "overview", "metrics"),
      options,
    );
  }

  activity(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ activity: OverviewActivityItem[] }>(
      orgPath(organizationSlug, "overview", "activity"),
      options,
    );
  }

  projects(organizationSlug: string, options: GoSvcJsonRequest = {}) {
    return this.request.json<{ projects: OverviewProjectItem[] }>(
      orgPath(organizationSlug, "overview", "projects"),
      options,
    );
  }

  board(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ board: OverviewBoardItem[] }>(
      orgPath(organizationSlug, "overview", "board"),
      options,
    );
  }

  automations(organizationSlug: string, options: GoSvcRequestOptions = {}) {
    return this.request.json<{ automations: OverviewAutomationItem[] }>(
      orgPath(organizationSlug, "overview", "automations"),
      options,
    );
  }
}
