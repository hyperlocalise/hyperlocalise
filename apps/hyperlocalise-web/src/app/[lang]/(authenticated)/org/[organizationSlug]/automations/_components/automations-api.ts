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
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import type { createApiClient } from "@/lib/api-client";
import { readApiResponseError } from "@/lib/api-error";

export type AutomationSummaryRow = WorkspaceAutomationRecord;

export type GithubAutoReviewRepositoryOption = {
  id: string;
  fullName: string;
  enabled: boolean;
  archived: boolean;
};

export type GithubAutoReviewSettingsDto = {
  enabled: boolean;
  additionalPrompt: string;
  githubInstallationRepositoryIds: string[];
  repositories: GithubAutoReviewRepositoryOption[];
};

export type GithubAutoReviewSettingsWrite = {
  enabled: boolean;
  additionalPrompt: string;
  githubInstallationRepositoryIds: string[];
};

export type AutomationsApi = {
  listAutomations(organizationSlug: string): Promise<AutomationSummaryRow[]>;
  getGithubAutoReviewSettings(organizationSlug: string): Promise<GithubAutoReviewSettingsDto>;
  updateGithubAutoReviewSettings(
    organizationSlug: string,
    input: GithubAutoReviewSettingsWrite,
  ): Promise<GithubAutoReviewSettingsDto>;
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
    async getGithubAutoReviewSettings(organizationSlug) {
      const response = await automations["github-auto-review"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load Auto-review settings");
      }
      const body = (await response.json()) as { autoReview: GithubAutoReviewSettingsDto };
      return body.autoReview;
    },
    async updateGithubAutoReviewSettings(organizationSlug, input) {
      const response = await automations["github-auto-review"].$put({
        param: { organizationSlug },
        json: input,
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to save Auto-review settings");
      }
      const body = (await response.json()) as { autoReview: GithubAutoReviewSettingsDto };
      return body.autoReview;
    },
  };
}
