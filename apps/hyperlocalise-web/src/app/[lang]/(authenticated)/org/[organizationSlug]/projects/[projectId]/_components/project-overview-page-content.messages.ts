"use client";

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
import { defineMessages } from "react-intl";

export const projectOverviewPageContentMessages = defineMessages({
  createJob: {
    defaultMessage: "Create job",
    id: "7WTIzTDLbF",
    description: "Button on project overview to open the create job dialog",
  },
  viewStrings: {
    defaultMessage: "View strings",
    id: "EBgNz2ZSu6",
    description: "Button on project overview linking to the project Strings page",
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
    defaultMessage: "Project hub for localization work.",
    id: "fbtbMSQ/2I",
    description: "Fallback project description on the project overview page",
  },
  caughtUpHeroTitle: {
    defaultMessage: "You’re all caught up",
    id: "esZVdLzFOW",
    description: "Project overview hero title when there are no pending actions",
  },
  caughtUpHeroDescription: {
    defaultMessage:
      "No pending actions right now. Upload source files or review completed jobs when you’re ready to continue.",
    id: "VZSf2k42GF",
    description: "Project overview hero description when there are no pending actions",
  },
  browseFilesCta: {
    defaultMessage: "Browse files",
    id: "Q3hdQblIYe",
    description: "Project overview hero call-to-action when the project is caught up",
  },
  attentionHeroTitle: {
    defaultMessage: "A few things need your attention",
    id: "3XNlGxtFuq",
    description: "Project overview hero title when pending actions need review",
  },
  attentionHeroDescription: {
    defaultMessage: "Pick up where you left off — {details}.",
    id: "hx+ozGK2uu",
    description: "Project overview hero description listing open jobs and files needing attention",
  },
  openJobsDetail: {
    defaultMessage: "{count, plural, one {# open job} other {# open jobs}}",
    id: "SyMDAHRe17",
    description: "Fragment listing open job count in the project overview hero",
  },
  filesNeedingAttentionDetail: {
    defaultMessage:
      "{count, plural, one {# file needing attention} other {# files needing attention}}",
    id: "e3B7xw2yS4",
    description: "Fragment listing files needing attention in the project overview hero",
  },
  pickUpWhereYouLeftOffCta: {
    defaultMessage: "Pick up where you left off",
    id: "2P3llDCJQ9",
    description: "Project overview hero call-to-action when work needs attention",
  },
  snapshotTitle: {
    defaultMessage: "Project snapshot",
    id: "tQnsj9c8zW",
    description: "Title of the project snapshot card on project overview",
  },
  snapshotLocales: {
    defaultMessage: "Locales",
    id: "0pVEMuUCAh",
    description: "Project snapshot row label for source and target locales",
  },
  snapshotSource: {
    defaultMessage: "Source",
    id: "R1inHgae6i",
    description: "Project snapshot row label for project source type",
  },
  snapshotOpenJobs: {
    defaultMessage: "Open jobs",
    id: "qoKaksFa9x",
    description: "Project snapshot row label for open job count",
  },
  nativeProjectSource: {
    defaultMessage: "Native project",
    id: "kpZpdwbYk2",
    description: "Project snapshot source value for Hyperlocalise-native projects",
  },
  openJobsUnavailable: {
    defaultMessage: "Unavailable",
    id: "Z9kckxHp8S",
    description: "Shown in project snapshot when open job count fails to load",
  },
  viewSettings: {
    defaultMessage: "View settings",
    id: "zIinCypcXs",
    description: "Call-to-action on the project snapshot card linking to project settings",
  },
  ongoingSection: {
    defaultMessage: "Ongoing",
    id: "AUY6LRuqkn",
    description: "Section heading for ongoing jobs and files on project overview",
  },
  categoryJob: {
    defaultMessage: "Job",
    id: "zliOrjr0oj",
    description: "Category badge for a job card on project overview",
  },
  categoryFile: {
    defaultMessage: "File",
    id: "XlCqTK9P8L",
    description: "Category badge for a file card on project overview",
  },
  jobStatusUpdated: {
    defaultMessage: "{status} · updated {updated}",
    id: "intwkVhq+i",
    description: "Status line for an ongoing job card showing status and relative update time",
  },
  needsAttention: {
    defaultMessage: "Needs attention",
    id: "Jwoqn7hfPq",
    description: "Fallback status line when a file needs attention but has no readiness summary",
  },
  jobsUnavailable: {
    defaultMessage: "Jobs unavailable",
    id: "M4sYVolrI+",
    description: "Empty-state title when project jobs fail to load",
  },
  noActiveJobs: {
    defaultMessage: "No active jobs",
    id: "qsiC3fEv6E",
    description: "Empty-state title when the project has no active jobs",
  },
  jobsUnavailableDescription: {
    defaultMessage: "We could not load jobs for this project.",
    id: "CvYNnC7KYY",
    description: "Empty-state description when project jobs fail to load",
  },
  noActiveJobsDescription: {
    defaultMessage: "Queued, running, and review jobs will appear here.",
    id: "VreTPRoxTI",
    description: "Empty-state description when the project has no active jobs",
  },
  viewJobs: {
    defaultMessage: "View jobs",
    id: "ah1fHcY0dZ",
    description: "Button linking to the project jobs page from the empty jobs card",
  },
  filesUnavailable: {
    defaultMessage: "Files unavailable",
    id: "lnENdnqB3K",
    description: "Empty-state title when project files fail to load",
  },
  noFilesNeedAttention: {
    defaultMessage: "No files need attention",
    id: "ng2kCyPWWf",
    description: "Empty-state title when no project files need attention",
  },
  filesUnavailableDescription: {
    defaultMessage: "We could not load project files.",
    id: "MtSPbgepa5",
    description: "Empty-state description when project files fail to load",
  },
  noFilesNeedAttentionDescription: {
    defaultMessage: "Files with missing or changed translations will appear here.",
    id: "Pu5h/suwW5",
    description: "Empty-state description when no project files need attention",
  },
  viewFiles: {
    defaultMessage: "View files",
    id: "3KtrgP1VL6",
    description: "Button linking to the project files page from the empty files card",
  },
  readyToPullTitle: {
    defaultMessage: "Ready to pull",
    id: "PMhWQU9+xq",
    description: "Title of the ready-to-pull callout on project overview",
  },
  readyToPullDescription: {
    defaultMessage:
      "{count, plural, one {# file has} other {# files have}} completed translations you can download or sync with <code>sync pull</code>.",
    id: "iczDvJ3VLc",
    description:
      "Description of files ready to pull, with the sync pull command highlighted in monospace",
  },
  openFiles: {
    defaultMessage: "Open files",
    id: "/L2n1hwt0/",
    description: "Button linking to project files from the ready-to-pull callout",
  },
  loadProjectFilesFailed: {
    defaultMessage: "Failed to load project files",
    id: "fIXR+y8rly",
    description: "Error when the project overview files query fails",
  },
  invalidProjectFilesResponse: {
    defaultMessage: "Invalid project files response",
    id: "kgAiiSB4O6",
    description: "Error when the project overview files API returns an unexpected payload",
  },
});
