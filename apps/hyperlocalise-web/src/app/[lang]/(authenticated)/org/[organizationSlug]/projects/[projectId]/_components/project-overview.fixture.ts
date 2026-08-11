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
import type { ApiJob } from "../../../jobs/_components/jobs-page-view";
import type { ProjectListRow } from "../../_components/project-list";

export const projectOverviewFixture: ProjectListRow = {
  id: "project_website",
  name: "Website localization",
  key: "website",
  description: "Marketing site and product copy",
  descriptionValue: "Marketing site and product copy",
  translationContext: "Friendly, concise marketing tone",
  translationContextValue: "Friendly, concise marketing tone",
  created: "Jan 12, 2026, 9:30 AM",
  updated: "Mar 18, 2026, 2:15 PM",
  source: "native",
  externalProviderKind: null,
  externalProjectId: null,
  sourceLocale: "en-US",
  targetLocales: ["fr-FR", "de-DE", "es-ES"],
  externalProjectUrl: null,
  isActive: true,
  logoUrl: null,
  lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  lastSyncedAt: "Mar 18, 2026, 1:00 PM",
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  openJobCount: 2,
};

export const projectOverviewTmsFixture: ProjectListRow = {
  ...projectOverviewFixture,
  source: "external_tms",
  externalProviderKind: "crowdin",
  externalProjectId: "42",
  externalProjectUrl: "https://crowdin.com/project/website",
  lastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

export const projectOverviewCaughtUpFixture: ProjectListRow = {
  ...projectOverviewFixture,
  openJobCount: 0,
};

export const projectOverviewMissingGuidanceFixture: ProjectListRow = {
  ...projectOverviewFixture,
  translationContext: "No translation context",
  translationContextValue: "",
  openJobCount: 0,
};

export const projectOverviewJobsFixture: ApiJob[] = [
  {
    id: "job_translate_home",
    projectId: "project_website",
    createdByUserId: "user_1",
    kind: "translation",
    type: "file",
    status: "running",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    completedAt: null,
    workflowRunId: null,
    lastError: null,
    inputPayload: { sourceFileId: "marketing/home.json", metadata: { title: "Home page" } },
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: null,
    reviewTargetLocale: null,
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: null,
    externalTaskId: null,
    externalStatus: null,
    externalTitle: null,
    externalDueDate: null,
    externalTargetLocales: ["de-DE", "es-ES"],
    externalAssignedUsers: ["Mina"],
    externalSyncState: null,
  },
  {
    id: "job_review_strings",
    projectId: "project_website",
    createdByUserId: "user_1",
    kind: "review",
    type: null,
    status: "waiting_for_review",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    completedAt: null,
    workflowRunId: null,
    lastError: null,
    inputPayload: null,
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: "Terminology consistency",
    reviewTargetLocale: "fr-FR",
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: null,
    externalTaskId: null,
    externalStatus: null,
    externalTitle: null,
    externalDueDate: null,
    externalTargetLocales: null,
    externalAssignedUsers: ["Otto"],
    externalSyncState: null,
  },
];
