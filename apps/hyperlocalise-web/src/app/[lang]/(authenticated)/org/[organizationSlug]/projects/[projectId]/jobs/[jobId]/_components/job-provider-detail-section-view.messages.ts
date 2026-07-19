"use client";

import { defineMessages } from "react-intl";

export const jobProviderDetailSectionViewMessages = defineMessages({
  providerDetailsHeading: {
    defaultMessage: "Provider Details",
    id: "s1GW7X0/Lj",
    description: "Heading for the provider metadata section on a job",
  },
  labelProviderTitle: {
    defaultMessage: "Provider title",
    id: "+J3cetpwAk",
    description: "Row label for the external provider job title",
  },
  labelProviderStatus: {
    defaultMessage: "Provider status",
    id: "dakChM2xsG",
    description: "Row label for the external provider status",
  },
  labelLanguage: {
    defaultMessage: "Language",
    id: "+0iMxWNkSS",
    description: "Row label for the Crowdin language on a provider job",
  },
  labelTargetLocales: {
    defaultMessage: "Target locales",
    id: "PLgCHGSCvk",
    description: "Row label for target locales on a provider job",
  },
  labelDescription: {
    defaultMessage: "Description",
    id: "9ZuihAiXHq",
    description: "Row label for the Crowdin job description",
  },
  labelAssignees: {
    defaultMessage: "Assignees",
    id: "CyLUFnbRQ7",
    description: "Row label for assigned users on a provider job",
  },
  labelDeadline: {
    defaultMessage: "Deadline",
    id: "yWGQFXoYys",
    description: "Row label for the provider job deadline",
  },
  labelExternalJobId: {
    defaultMessage: "External job ID",
    id: "z5Eo+0wB9k",
    description: "Row label for the external job ID",
  },
  labelExternalTaskId: {
    defaultMessage: "External task ID",
    id: "u4YuSwj+fI",
    description: "Row label for the external task ID",
  },
  labelProviderLink: {
    defaultMessage: "Provider link",
    id: "9bfhz1vEcj",
    description: "Row label for the link to the job in the TMS",
  },
  openInProvider: {
    defaultMessage: "Open in {providerKind}",
    id: "+rmN8L+YLt",
    description: "Link label to open the job in the external TMS provider",
  },
  labelRawError: {
    defaultMessage: "Raw error",
    id: "yWct5TBmd2",
    description: "Row label for the last provider error message",
  },
  emptyValue: {
    defaultMessage: "—",
    id: "+M3Cw0Pn31",
    description: "Placeholder when a provider detail value is empty",
  },
  sourceFilesHeading: {
    defaultMessage: "Source files",
    id: "eeAFg4MRde",
    description: "Heading for the collapsible source files section",
  },
  showSourceFiles: {
    defaultMessage: "Show source files",
    id: "H5jj/DvcV9",
    description: "Button to expand and load linked source files",
  },
  sourceFilesCollapsedHint: {
    defaultMessage: "Load linked source files when you are ready to review or open them.",
    id: "UXqIGtslvw",
    description: "Hint shown before source files are expanded",
  },
  agentActionsHeading: {
    defaultMessage: "Agent Actions",
    id: "Xs0cc+EY83",
    description: "Heading for available provider agent action buttons",
  },
  starting: {
    defaultMessage: "Starting…",
    id: "4HbZHDcqLo",
    description: "Button label while an agent action is starting",
  },
  agentActivityHeading: {
    defaultMessage: "Agent Activity",
    id: "+ufsbqnrz9",
    description: "Heading for the agent run history list",
  },
  unableToLoadAgentRuns: {
    defaultMessage: "Unable to load agent runs",
    id: "nVaRoL1Gb1",
    description: "Fallback error when agent runs fail to load without an Error message",
  },
  startedAt: {
    defaultMessage: "Started {date}",
    id: "m4T47CFq5h",
    description: "Timestamp line for when an agent run started",
  },
  proposalsCount: {
    defaultMessage: "{count, plural, one {# proposal} other {# proposals}}",
    id: "M7pTNyMB/G",
    description: "Count of reviewable proposals on an agent run",
  },
  tmMatchesCount: {
    defaultMessage: "{count, plural, one {# TM match} other {# TM matches}}",
    id: "eLo7E5V/hO",
    description: "Count of translation memory matches used in an agent run",
  },
  glossaryMatchesCount: {
    defaultMessage: "{count, plural, one {# glossary match} other {# glossary matches}}",
    id: "Doht/xtgVL",
    description: "Count of glossary matches used in an agent run",
  },
  reviewProposals: {
    defaultMessage: "Review proposals",
    id: "Uv4fMm9uKS",
    description: "Badge indicating an agent run has proposals to review",
  },
  noAgentRunsYet: {
    defaultMessage: "No agent runs yet.",
    id: "WDmTfqzG7L",
    description: "Empty state when a job has no agent activity",
  },
});
