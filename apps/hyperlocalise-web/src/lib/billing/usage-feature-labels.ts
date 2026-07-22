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
import { billingBalanceFeatureIds, type AutumnFeatureId } from "@/lib/billing/autumn-ids";

/** Display labels for Autumn feature balances shown on billing settings. */
export const usageFeatureLabels: Partial<Record<AutumnFeatureId, string>> = {
  ai_tokens: "AI Credit",
  translation_jobs: "Translation jobs",
  agent_runs: "Agent runs",
  seats: "Seats",
  projects: "Projects",
  automations: "Automations",
  integrations: "Integrations",
};

export function getUsageFeatureLabel(featureId: string) {
  if (featureId in usageFeatureLabels) {
    return usageFeatureLabels[featureId as AutumnFeatureId];
  }

  return featureId.replaceAll("_", " ");
}

export { billingBalanceFeatureIds };
