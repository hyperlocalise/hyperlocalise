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
