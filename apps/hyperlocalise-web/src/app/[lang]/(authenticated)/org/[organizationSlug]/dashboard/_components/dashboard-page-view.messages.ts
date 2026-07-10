"use client";

import { defineMessages } from "react-intl";

export const dashboardPageViewMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "mRWwmBY6N9",
    description: "Dashboard page header eyebrow label",
  },
  pageTitle: {
    defaultMessage: "Overview",
    id: "6xnpnIBioo",
    description: "Dashboard page heading",
  },
  pageDescription: {
    defaultMessage:
      "Your workspace at a glance — assigned work, latest activity, and recent projects.",
    id: "0fORPZlrsy",
    description: "Dashboard page description under the heading",
  },
  setupProgressLabel: {
    defaultMessage: "Workspace setup · {completedCount} of {totalCount} complete",
    id: "yX53I7eVol",
    description: "Dashboard setup hero progress summary",
  },
  setupProgressMeter: {
    defaultMessage: "Setup progress",
    id: "szGONLZ/cQ",
    description: "Label above the workspace setup progress bar",
  },
  setupProgressPercent: {
    defaultMessage: "{value}%",
    id: "tT+/GoDfXt",
    description: "Workspace setup progress percentage value",
  },
  newRequest: {
    defaultMessage: "New request",
    id: "vKq2ly7dxU",
    description: "Button to start a new localization request from the dashboard",
  },
  loadingWorkspaceOverview: {
    defaultMessage: "Loading workspace overview",
    id: "28e0S0f2HW",
    description: "Accessible label while the dashboard hero is loading",
  },
  loadingPanel: {
    defaultMessage: "Loading {title}",
    id: "GpQTuQOUij",
    description: "Accessible label while a dashboard panel is loading",
  },
  panelLoadError: {
    defaultMessage: "{title} could not be loaded.",
    id: "IvJJwlEgW1",
    description: "Generic error when a dashboard panel fails to load",
  },
  quickStartLabel: {
    defaultMessage: "Quick start",
    id: "xg+IeoG5GL",
    description: "Label above the dashboard quick-start card",
  },
  quickStartTitle: {
    defaultMessage: "Ask the localization agent",
    id: "YM9k2kDsM2",
    description: "Dashboard quick-start card title",
  },
  quickStartDescription: {
    defaultMessage:
      "Describe what you need translated, researched, or reviewed and Hyperlocalise will prepare the work.",
    id: "mrsptKTM1v",
    description: "Dashboard quick-start card description",
  },
  myJobsTitle: {
    defaultMessage: "My jobs",
    id: "PZP/M3m1NM",
    description: "Dashboard panel title for jobs assigned to the current user",
  },
  myJobsDescription: {
    defaultMessage: "The latest work assigned to you, prioritized by what needs action.",
    id: "YlRGuiYchN",
    description: "Dashboard panel description for assigned jobs",
  },
  myJobsEmpty: {
    defaultMessage: "No jobs assigned to you yet.",
    id: "Q38XCcr+cJ",
    description: "Empty state when the user has no assigned jobs",
  },
  latestJobsTitle: {
    defaultMessage: "Latest jobs",
    id: "ENDjImu9Gr",
    description: "Dashboard panel title for recently updated workspace jobs",
  },
  latestJobsDescription: {
    defaultMessage: "The most recently updated work across this workspace.",
    id: "u7mPxFIRkS",
    description: "Dashboard panel description for latest jobs",
  },
  latestJobsEmpty: {
    defaultMessage: "No workspace jobs yet.",
    id: "8MmPpIGj4f",
    description: "Empty state when the workspace has no jobs",
  },
  recentProjectsTitle: {
    defaultMessage: "Recent projects",
    id: "YUeo87Wdbn",
    description: "Dashboard panel title for recently opened projects",
  },
  recentProjectsDescription: {
    defaultMessage: "Projects you opened recently, followed by active workspace projects.",
    id: "IQiUadYsfM",
    description: "Dashboard panel description for recent projects",
  },
  recentProjectsEmpty: {
    defaultMessage: "No native projects yet. Create a project to get started.",
    id: "1Do2u8ufv7",
    description: "Empty state when there are no native projects",
  },
  tmsJobsTitle: {
    defaultMessage: "{providerName} jobs",
    id: "mhdxPi6b4a",
    description: "Dashboard panel title for live TMS jobs",
  },
  tmsJobsDescription: {
    defaultMessage: "Live jobs fetched from {providerName}.",
    id: "nqMa1yML6t",
    description: "Dashboard panel description for live TMS jobs",
  },
  tmsJobsEmpty: {
    defaultMessage: "No jobs found in {providerName}.",
    id: "IgBvohPlHZ",
    description: "Empty state when a TMS provider has no jobs",
  },
  tmsProjectsTitle: {
    defaultMessage: "{providerName} projects",
    id: "CfAFoekPz1",
    description: "Dashboard panel title for live TMS projects",
  },
  tmsProjectsDescription: {
    defaultMessage: "Live projects fetched from {providerName}.",
    id: "s8Aqn1fSU6",
    description: "Dashboard panel description for live TMS projects",
  },
  tmsProjectsEmpty: {
    defaultMessage: "No projects found in {providerName}.",
    id: "EURqQwIzfO",
    description: "Empty state when a TMS provider has no projects",
  },
  viewAllJobs: {
    defaultMessage: "View all jobs",
    id: "Z4DRhv/lJb",
    description: "Footer link to open the full jobs list from a dashboard panel",
  },
  viewAllProjects: {
    defaultMessage: "View all projects",
    id: "GlOm2GgrZG",
    description: "Footer link to open the full projects list from a dashboard panel",
  },
  workspaceFallbackProject: {
    defaultMessage: "Workspace",
    id: "0bdrX6gjre",
    description: "Fallback project name when a job has no project",
  },
  jobMeta: {
    defaultMessage: "{projectName} · {kindLabel} · updated {updatedAt}",
    id: "EO0pk2ty3D",
    description: "Secondary metadata line for a job row on the dashboard",
  },
  projectOpenBadge: {
    defaultMessage: "{count} open",
    id: "IQHhkgmw8g",
    description: "Badge showing how many open actions a project has",
  },
  projectUpToDate: {
    defaultMessage: "Up to date",
    id: "JIuT2aW94P",
    description: "Badge when a project has no open actions",
  },
  projectMetaWithUpdate: {
    defaultMessage: "{sourceLabel} · {localeRoute} · updated {updatedAt}",
    id: "aFSdZ6B2XX",
    description: "Secondary metadata line for a project row with a last-updated time",
  },
  projectMeta: {
    defaultMessage: "{sourceLabel} · {localeRoute}",
    id: "w1P9m9KNH8",
    description: "Secondary metadata line for a project row without a last-updated time",
  },
  integrationsTitle: {
    defaultMessage: "Integrations",
    id: "JYTpmBUkk7",
    description: "Dashboard section heading for workspace integrations",
  },
  loadingIntegrations: {
    defaultMessage: "Loading integrations",
    id: "7YQmBHx9HV",
    description: "Accessible label while dashboard integrations are loading",
  },
  connected: {
    defaultMessage: "Connected",
    id: "ykK86HWH4K",
    description: "Badge when an integration is connected",
  },
  notConnected: {
    defaultMessage: "Not connected",
    id: "Mo3KUqU9mk",
    description: "Badge when an integration is not connected",
  },
  manage: {
    defaultMessage: "Manage",
    id: "0ZnjVna/1A",
    description: "Link label to manage a connected integration",
  },
  connect: {
    defaultMessage: "Connect",
    id: "kRgGKX2G/s",
    description: "Link label to connect an integration",
  },
  automationRunsTitle: {
    defaultMessage: "Automation runs",
    id: "xCfBoLh9Rp",
    description: "Dashboard section heading for recent automation runs",
  },
  viewAutomations: {
    defaultMessage: "View automations",
    id: "vynGfdRurY",
    description: "Button to open the automations page from the dashboard",
  },
  loadingAutomationRuns: {
    defaultMessage: "Loading automation runs",
    id: "M1OWEzMawd",
    description: "Accessible label while automation runs are loading",
  },
  automationRunsLoadError: {
    defaultMessage: "Automation runs could not be loaded.",
    id: "RHVJ0v0DYf",
    description: "Error when dashboard automation runs fail to load",
  },
  automationStats: {
    defaultMessage: "{total} automations · {active} active · {paused} paused",
    id: "qPUZCfT/yV",
    description: "Summary counts for workspace automations on the dashboard",
  },
  noAutomationRuns: {
    defaultMessage: "No automation runs yet.",
    id: "yF+d/IbGFc",
    description: "Empty state when there are no automation runs",
  },
  runCompleted: {
    defaultMessage: "{triggerSource} · completed {completedAt}",
    id: "6QjQu7ZEVO",
    description: "Automation run metadata when the run has completed",
  },
  runInProgress: {
    defaultMessage: "{triggerSource} · in progress",
    id: "FNTVTGlcTd",
    description: "Automation run metadata while the run is still in progress",
  },
  runStatusQueued: {
    defaultMessage: "Queued",
    id: "Khk1oUs6TP",
    description: "Automation run status badge for queued runs",
  },
  runStatusRunning: {
    defaultMessage: "Running",
    id: "D7NvZBBM/6",
    description: "Automation run status badge for running runs",
  },
  runStatusSucceeded: {
    defaultMessage: "Succeeded",
    id: "B+9mu1WlLc",
    description: "Automation run status badge for succeeded runs",
  },
  runStatusFailed: {
    defaultMessage: "Failed",
    id: "jgrmHo9SE2",
    description: "Automation run status badge for failed runs",
  },
  runStatusCancelled: {
    defaultMessage: "Cancelled",
    id: "oKp30YYGZb",
    description: "Automation run status badge for cancelled runs",
  },
  runStatusSkipped: {
    defaultMessage: "Skipped",
    id: "Qklvn9azHF",
    description: "Automation run status badge for skipped runs",
  },
  triggerManual: {
    defaultMessage: "Manual",
    id: "MpshM2ubvT",
    description: "Automation run trigger source label for manual runs",
  },
  triggerScheduled: {
    defaultMessage: "Scheduled",
    id: "t+TLW1HZ59",
    description: "Automation run trigger source label for scheduled runs",
  },
  triggerGithub: {
    defaultMessage: "GitHub",
    id: "SYEyQ9llcS",
    description: "Automation run trigger source label for GitHub-triggered runs",
  },
  triggerContentful: {
    defaultMessage: "Contentful",
    id: "GdufIv1RQV",
    description: "Automation run trigger source label for Contentful-triggered runs",
  },
  triggerSourceUpload: {
    defaultMessage: "Source upload",
    id: "h3/Sx/1Xgp",
    description: "Automation run trigger source label for source-upload-triggered runs",
  },
});
