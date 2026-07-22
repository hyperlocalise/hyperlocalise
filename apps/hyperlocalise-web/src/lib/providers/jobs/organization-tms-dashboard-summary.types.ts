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
import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

export type TmsDashboardProviderItem = {
  id: string;
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  validationStatus: string;
  projectCount: number;
  lastMaterializedAt: string | null;
};

export type TmsDashboardSummaryCounts = {
  connectedProviders: number;
  externalProjects: number;
  openProviderJobs: number;
};

export type OrganizationTmsDashboardSummary = {
  providers: TmsDashboardProviderItem[];
  counts: TmsDashboardSummaryCounts;
};
