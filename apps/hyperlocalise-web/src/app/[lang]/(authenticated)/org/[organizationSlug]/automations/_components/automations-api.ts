/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";
import type { createApiClient } from "@/lib/api-client";
import { readApiResponseError } from "@/lib/api-error";

export type AutomationSummaryRow = WorkspaceAutomationRecord;

export type AutomationsApi = {
  listAutomations(organizationSlug: string): Promise<AutomationSummaryRow[]>;
};

type ApiClient = ReturnType<typeof createApiClient>;

export function createAutomationsApi(client: ApiClient): AutomationsApi {
  const automations = client.api.orgs[":organizationSlug"].automations;

  return {
    async listAutomations(organizationSlug) {
      const response = await automations.$get({
        param: { organizationSlug },
        query: { limit: "100", offset: "0" },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load automations");
      }
      const body = (await response.json()) as { automations: AutomationSummaryRow[] };
      return body.automations;
    },
  };
}
