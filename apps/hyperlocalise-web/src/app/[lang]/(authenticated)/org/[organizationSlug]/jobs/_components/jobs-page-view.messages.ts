"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { MessageDescriptor } from "react-intl";
import { defineMessages } from "react-intl";

type JobStatus = "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";

type JobsStatusFilter = "all" | JobStatus;

export const jobsPageViewMessages = defineMessages({
  statusQueued: {
    defaultMessage: "Queued",
    id: "XuiVUmGIu9",
    description: "Job status label for queued jobs",
  },
  statusRunning: {
    defaultMessage: "Running",
    id: "WzUqM2nTU8",
    description: "Job status label for running jobs",
  },
  statusSucceeded: {
    defaultMessage: "Succeeded",
    id: "FcadZC4Ojx",
    description: "Job status label for succeeded jobs",
  },
  statusFailed: {
    defaultMessage: "Failed",
    id: "6v642AIPEK",
    description: "Job status label for failed jobs",
  },
  statusWaitingForReview: {
    defaultMessage: "Waiting for review",
    id: "iGnaQ/kXrJ",
    description: "Job status label for jobs waiting for review",
  },
  statusCancelled: {
    defaultMessage: "Cancelled",
    id: "7AiYKudhqp",
    description: "Job status label for cancelled jobs",
  },
  statusFilterAll: {
    defaultMessage: "All status",
    id: "fdNYFpldO1",
    description: "Jobs status filter option to show all statuses",
  },
  loadErrorTitle: {
    defaultMessage: "Jobs failed to load.",
    id: "FHqHBUJ88J",
    description: "Error title when the jobs list request fails",
  },
  loadErrorFallback: {
    defaultMessage: "Failed to load jobs.",
    id: "qcbg+R1kQS",
    description: "Fallback error description when no API message is available",
  },
  loadingJobs: {
    defaultMessage: "Loading jobs…",
    id: "Dwu72TwwL/",
    description: "Loading state while the jobs list is fetching",
  },
  columnName: {
    defaultMessage: "Name",
    id: "gApOTEuTv4",
    description: "Jobs list column header for job name",
  },
  columnSource: {
    defaultMessage: "Source",
    id: "tg/aV3KaU6",
    description: "Jobs list column header for job source provider",
  },
  columnProject: {
    defaultMessage: "Project",
    id: "e+qzXq1bUT",
    description: "Jobs list column header for project name",
  },
  columnStatus: {
    defaultMessage: "Status",
    id: "jFmVURLI4A",
    description: "Jobs list column header for job status",
  },
  columnTaskDetails: {
    defaultMessage: "Task details",
    id: "1FrqZ8RCIU",
    description: "Jobs list column header for locales and assignees",
  },
  columnActions: {
    defaultMessage: "Actions",
    id: "k8AGhyD7g4",
    description: "Jobs list column header for row actions",
  },
  workspaceFallback: {
    defaultMessage: "Workspace",
    id: "3n0F65flH2",
    description: "Fallback label when a job has no project name",
  },
  dueMeta: {
    defaultMessage: "Due {due}",
    id: "GvcjcKm7Sc",
    description: "Relative due date under job task details",
  },
  viewModeAriaLabel: {
    defaultMessage: "Jobs view mode",
    id: "9yljEAQK89",
    description: "Accessible label for the row versus board view toggle",
  },
  viewModeRow: {
    defaultMessage: "Row",
    id: "dsAsLnB2MG",
    description: "Button label to show jobs as a list",
  },
  viewModeBoard: {
    defaultMessage: "Board",
    id: "KG5OUSGbKU",
    description: "Button label to show jobs as a kanban board",
  },
  filterSearch: {
    defaultMessage: "Search",
    id: "kC3PfwuLdP",
    description: "Label above the jobs search field",
  },
  filterSearchPlaceholder: {
    defaultMessage: "Jobs, providers, locales, assignees...",
    id: "JnBi/qJh07",
    description: "Placeholder text in the jobs search field",
  },
  filterStatus: {
    defaultMessage: "Status",
    id: "HxcjgjcAgw",
    description: "Label above the jobs status filter",
  },
  filterView: {
    defaultMessage: "View",
    id: "PATshCyE6V",
    description: "Label above the jobs view mode toggle",
  },
  sectionAssignedToMe: {
    defaultMessage: "Assigned to me",
    id: "qeeSJl75WM",
    description: "Section heading for jobs assigned to the current user",
  },
  sectionCreatedByMe: {
    defaultMessage: "Created by me",
    id: "zirutH7PO0",
    description: "Section heading for jobs created by the current user",
  },
  nativeJobsTitle: {
    defaultMessage: "Hyperlocalise jobs",
    id: "KOI3KSEDDk",
    description: "Section title for native Hyperlocalise jobs",
  },
  nativeJobsDescription: {
    defaultMessage: "Jobs created and tracked in this workspace.",
    id: "k3TrZpmKkB",
    description: "Description under the native jobs section title",
  },
  tmsJobsTitle: {
    defaultMessage: "TMS jobs",
    id: "Ze+mVOXG0h",
    description: "Section title for live TMS provider jobs",
  },
  tmsJobsDescription: {
    defaultMessage: "Live jobs fetched from your connected TMS provider.",
    id: "1e/ZaE2rH7",
    description: "Description under the TMS jobs section for workspace scope",
  },
  tmsJobsAssignedDescription: {
    defaultMessage: "Live jobs assigned to you in the connected provider.",
    id: "TFnG73Az5B",
    description: "Description under the TMS jobs section for personal assigned scope",
  },
  emptyAssignedNative: {
    defaultMessage: "No assigned Hyperlocalise jobs found.",
    id: "YTRbiRB1qL",
    description: "Empty state when the user has no assigned native jobs",
  },
  emptyAssignedTms: {
    defaultMessage: "No assigned TMS jobs found.",
    id: "QkxwQQPimv",
    description: "Empty state when the user has no assigned TMS jobs",
  },
  emptyCreatedNative: {
    defaultMessage: "No Hyperlocalise jobs created by you found.",
    id: "0JvtLHpNGT",
    description: "Empty state when the user has created no native jobs",
  },
  emptyNativeProject: {
    defaultMessage: "No Hyperlocalise jobs found for this project yet.",
    id: "SusA/f3CfU",
    description: "Empty state for native jobs in a project",
  },
  emptyNativePersonal: {
    defaultMessage: "No Hyperlocalise work items found for your account.",
    id: "TtcvnbdV7R",
    description: "Empty state for native jobs in personal workspace scope",
  },
  emptyNativeWorkspace: {
    defaultMessage: "No Hyperlocalise jobs found for this workspace.",
    id: "V/nJMxzENN",
    description: "Empty state for native jobs in workspace scope",
  },
  emptyTmsProject: {
    defaultMessage: "No TMS jobs found for this project.",
    id: "SKW9qV8rtN",
    description: "Empty state for TMS jobs in a project",
  },
  emptyTmsPersonal: {
    defaultMessage: "No TMS jobs assigned to you were returned from the live provider API.",
    id: "t3RhAFC8NZ",
    description: "Empty state for TMS jobs in personal workspace scope",
  },
  emptyTmsWorkspace: {
    defaultMessage: "No TMS jobs were returned from the live provider API.",
    id: "D6uFQeF0q1",
    description: "Empty state for TMS jobs in workspace scope",
  },
  projectSectionLabel: {
    defaultMessage: "Jobs",
    id: "q4g35VNiZ5",
    description: "Project page section label for the jobs view",
  },
  projectSectionDescription: {
    defaultMessage: "Translation, review, and QA work from Hyperlocalise and your TMS.",
    id: "zjUiRNln1O",
    description: "Project page section description for the jobs view",
  },
  workspaceLabel: {
    defaultMessage: "Workspace",
    id: "xSmzy2H6ua",
    description: "Workspace page header eyebrow label for jobs",
  },
  pageTitleJobs: {
    defaultMessage: "Jobs",
    id: "Q+H5CN9hp3",
    description: "Workspace jobs page heading",
  },
  pageTitleMyJobs: {
    defaultMessage: "My Jobs",
    id: "AeHzXlSphR",
    description: "Personal jobs page heading",
  },
  pageDescriptionWorkspace: {
    defaultMessage: "Hyperlocalise jobs and live TMS jobs tracked across the workspace.",
    id: "OLljhH3V9D",
    description: "Workspace jobs page description under the heading",
  },
  pageDescriptionPersonal: {
    defaultMessage: "Hyperlocalise and live TMS work assigned to you or created by you.",
    id: "/s8HFQ46mj",
    description: "Personal jobs page description under the heading",
  },
  noLocalesOrAssignees: {
    defaultMessage: "No locales or assignees",
    id: "c4wtcYLzS0",
    description: "Task details fallback when a job has neither locales nor assignees",
  },
  kindTranslation: {
    defaultMessage: "translation",
    id: "Fkgfxe1y6x",
    description: "Job kind label for translation jobs",
  },
  kindResearch: {
    defaultMessage: "research",
    id: "knhexLkbYQ",
    description: "Job kind label for research jobs",
  },
  kindReview: {
    defaultMessage: "review",
    id: "+zez4H8ovm",
    description: "Job kind label for review jobs",
  },
  kindProofread: {
    defaultMessage: "proofread",
    id: "4wrSufGtmm",
    description: "Job kind label for proofread jobs",
  },
  kindSync: {
    defaultMessage: "sync",
    id: "QdvsoHtp53",
    description: "Job kind label for sync jobs",
  },
  kindAssetManagement: {
    defaultMessage: "asset management",
    id: "w7sk9jcVLD",
    description: "Job kind label for asset management jobs",
  },
  kindTranslationWithType: {
    defaultMessage: "translation · {type}",
    id: "YkxvISUXc3",
    description: "Translation job kind label including string or file type",
  },
  reviewJobName: {
    defaultMessage: "Review: {criteria}",
    id: "/S7W2Oty8S",
    description: "Fallback job name for a review job using its criteria",
  },
  syncJobName: {
    defaultMessage: "{direction} {connector}",
    id: "4gW2ktRuC/",
    description: "Fallback job name for a sync job",
  },
  assetJobName: {
    defaultMessage: "{operation} {assetType}",
    id: "hTbl8aKMIU",
    description: "Fallback job name for an asset management job",
  },
  researchJobName: {
    defaultMessage: "Research: {scope}",
    id: "0P12MNf4ZM",
    description: "Fallback job name for a research job using its scope",
  },
  syncDirectionFallback: {
    defaultMessage: "sync",
    id: "Z6XcD4K+oU",
    description: "Fallback sync direction word in a sync job name",
  },
  assetOperationFallback: {
    defaultMessage: "manage",
    id: "MR3nUfsG07",
    description: "Fallback asset operation word in an asset job name",
  },
  kindWithTaskId: {
    defaultMessage: "{kind} · {taskId}",
    id: "Ckw9uq26zb",
    description: "Job kind and task identifier shown under the job name",
  },
});

const jobStatusMessages = {
  queued: jobsPageViewMessages.statusQueued,
  running: jobsPageViewMessages.statusRunning,
  succeeded: jobsPageViewMessages.statusSucceeded,
  failed: jobsPageViewMessages.statusFailed,
  waiting_for_review: jobsPageViewMessages.statusWaitingForReview,
  cancelled: jobsPageViewMessages.statusCancelled,
} as const satisfies Record<JobStatus, MessageDescriptor>;

export function getJobStatusMessage(status: JobStatus): MessageDescriptor {
  return jobStatusMessages[status];
}

export function getJobsStatusFilterMessage(status: JobsStatusFilter): MessageDescriptor {
  if (status === "all") {
    return jobsPageViewMessages.statusFilterAll;
  }
  return getJobStatusMessage(status);
}
