"use client";

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
import { defineMessages } from "react-intl";

export const projectOverviewPageContentMessages = defineMessages({
  createJob: {
    defaultMessage: "Create job",
    id: "7WTIzTDLbF",
    description: "Button on project overview to open the create job dialog",
  },
  openEditor: {
    defaultMessage: "Open Editor",
    id: "LPgS5mUnwV",
    description: "Button on project overview linking to the project Content Editor page",
  },
  projectOverviewFallbackTitle: {
    defaultMessage: "Project overview",
    id: "mehTxJuesM",
    description: "Fallback project overview heading when project details fail to load",
  },
  projectFallbackName: {
    defaultMessage: "Project",
    id: "NhoTfXzaHI",
    description: "Fallback project name when the project title is missing",
  },
  loadProjectError: {
    defaultMessage: "Unable to load project details. Refresh the page or try again in a moment.",
    id: "KjJZbmRFki",
    description: "Error message when project overview details fail to load",
  },
  defaultProjectDescription: {
    defaultMessage: "Today’s queue for this project.",
    id: "6lH73749rG",
    description: "Fallback project description on the project overview page",
  },
  projectsBreadcrumb: {
    defaultMessage: "Projects",
    id: "htyIICw1rr",
    description: "Breadcrumb link above the project overview title",
  },
  todayTitle: {
    defaultMessage: "Today",
    id: "3ljQO/9DOw",
    description: "Heading for the project overview triage list",
  },
  statusReview: {
    defaultMessage: "Review",
    id: "XbqvvLRiXp",
    description: "Status label for a job waiting for review on project overview",
  },
  statusFailed: {
    defaultMessage: "Failed",
    id: "FNmh/WsutT",
    description: "Status label for a failed job on project overview",
  },
  statusRunning: {
    defaultMessage: "Running",
    id: "RB1IMX1IND",
    description: "Status label for a running job on project overview",
  },
  statusQueued: {
    defaultMessage: "Queued",
    id: "LTsQcuBGvj",
    description: "Status label for a queued job on project overview",
  },
  statusSucceeded: {
    defaultMessage: "Succeeded",
    id: "CbiqfTdoAd",
    description: "Status label for a succeeded job on project overview",
  },
  statusCancelled: {
    defaultMessage: "Cancelled",
    id: "vT2hvp2ZbB",
    description: "Status label for a cancelled job on project overview",
  },
  statusGuidance: {
    defaultMessage: "Guidance",
    id: "dtHLu+0N41",
    description: "Status label when translation guidance is missing on project overview",
  },
  triageEmptyTitle: {
    defaultMessage: "No jobs yet",
    id: "RvnnjnXuP8",
    description: "Title when the project overview has no recent jobs",
  },
  triageEmptyDescription: {
    defaultMessage: "Create a job to start translating, or open Files to review coverage.",
    id: "p5wVg4GDmZ",
    description: "Description when the project overview has no recent jobs",
  },
  reviewCta: {
    defaultMessage: "Review",
    id: "v0Xmk6UQW5",
    description: "CTA for a job waiting for review on project overview",
  },
  openJobCta: {
    defaultMessage: "Open job",
    id: "wdhrNg8UHz",
    description: "CTA for a failed or active job on project overview",
  },
  addGuidanceCta: {
    defaultMessage: "Add style guide",
    id: "Z92vemu70G",
    description: "CTA when the project style guide is missing on project overview",
  },
  triageGuidanceTitle: {
    defaultMessage: "Add a style guide",
    id: "2DwX6LeAoB",
    description: "Title when the native project style guide is missing",
  },
  triageGuidanceDescription: {
    defaultMessage: "Shared tone and terminology so agents stay consistent.",
    id: "X02KnwxTqG",
    description: "Description when the native project style guide is missing",
  },
  viewAllJobs: {
    defaultMessage: "View all jobs",
    id: "QaBpv8qa4h",
    description: "Link from triage band to the project jobs page",
  },
  signalsLocales: {
    defaultMessage: "Locales",
    id: "wQOKFwmzrC",
    description: "Label for locale route on project overview signals",
  },
  signalsNoLocales: {
    defaultMessage: "No target locales yet",
    id: "Pw5huaM2vN",
    description: "Shown when the project has no target locales configured",
  },
  guidanceTitle: {
    defaultMessage: "Guidance",
    id: "iG6m4ZRJFP",
    description: "Section heading for the translation guidance preview on project overview",
  },
  guidanceMissingDescription: {
    defaultMessage: "Add tone and terminology so agents stay consistent.",
    id: "Y21JPIRCgK",
    description: "Sidebar prompt when the project has no translation guidance yet",
  },
  guidanceEdit: {
    defaultMessage: "Edit",
    id: "4/O19yxuqg",
    description: "Link to edit the style guide in project settings",
  },
  shipTitle: {
    defaultMessage: "Sync",
    id: "cE0bfQDgYq",
    description: "Section heading for native sync status on project overview",
  },
  shipLastSynced: {
    defaultMessage: "Last synced {when}",
    id: "I28Vekk8WA",
    description: "Last sync timestamp on project overview ship section",
  },
  shipNeverSynced: {
    defaultMessage: "Not synced yet",
    id: "wk5x4r43TH",
    description: "Shown when a native project has never synced",
  },
  shipConnectCli: {
    defaultMessage: "Connect CLI & CI",
    id: "NQq3ItGutD",
    description: "Link to project settings for CLI and CI setup",
  },
  viewSettings: {
    defaultMessage: "View settings",
    id: "PpiEEboJdd",
    description: "Call-to-action linking to project settings",
  },
  viewFiles: {
    defaultMessage: "View files",
    id: "9GZvF1K90w",
    description: "Button linking to the project files page",
  },
  viewJobs: {
    defaultMessage: "View jobs",
    id: "2c+GvUZLgD",
    description: "Button linking to the project jobs page",
  },
  jobsUnavailable: {
    defaultMessage: "Jobs unavailable",
    id: "M4sYVolrI+",
    description: "Empty-state title when project jobs fail to load",
  },
  jobsUnavailableDescription: {
    defaultMessage: "We could not load jobs for this project.",
    id: "CvYNnC7KYY",
    description: "Empty-state description when project jobs fail to load",
  },
});
