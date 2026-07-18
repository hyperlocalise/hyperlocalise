"use client";

import { defineMessages } from "react-intl";

export const workspaceAutomationFormMessages = defineMessages({
  scheduledTriggerHourly: {
    defaultMessage: "Every hour · {timezone}",
    id: "SlPmp40QPZ",
    description: "Summary for a scheduled automation that runs every hour",
  },
  scheduledTriggerDaily: {
    defaultMessage: "Every day at {time} · {timezone}",
    id: "TEXn81XSVY",
    description: "Summary for a scheduled automation that runs daily at a specific hour",
  },
  scheduledTriggerWeekly: {
    defaultMessage: "Every {weekday} at {time} · {timezone}",
    id: "8d4Iw9Q9DE",
    description: "Summary for a scheduled automation that runs weekly on a specific day and hour",
  },
  githubPushSummary: {
    defaultMessage: "GitHub push · {repository} · {branches}",
    id: "feBDOpIUbJ",
    description: "Header summary for a GitHub push trigger",
  },
  repositoryRequired: {
    defaultMessage: "repository required",
    id: "+UD+5d3g3H",
    description: "Placeholder in GitHub push summary when no repository is selected",
  },
  branchesRequired: {
    defaultMessage: "branches required",
    id: "YcomzE3n8l",
    description: "Placeholder in GitHub push summary when no branch patterns are set",
  },
  contentfulWebhook: {
    defaultMessage: "Contentful webhook",
    id: "1krX2eFo9o",
    description: "Label for the Contentful webhook trigger",
  },
  sourceUploadSummary: {
    defaultMessage: "Source upload · {project}",
    id: "3xhOvPA3lu",
    description: "Header summary for a source upload trigger with a project name",
  },
  sourceUploadProjectRequired: {
    defaultMessage: "Source upload · project required",
    id: "fBOGoQ4jb4",
    description: "Header summary for a source upload trigger when no project is selected",
  },
  selectRepository: {
    defaultMessage: "Select repository",
    id: "Tmw2QL/c7u",
    description: "Placeholder when no GitHub repository is selected",
  },
  unknownRepository: {
    defaultMessage: "Unknown repository",
    id: "5Yf/LdtZRn",
    description: "Label when a selected repository id is not in the loaded list",
  },
  repositoryDisabledSuffix: {
    defaultMessage: "{name} (disabled)",
    id: "LJSVMM6T2P",
    description: "Repository option label when the repository is disabled",
  },
  repositoryLabel: {
    defaultMessage: "Repository",
    id: "Omhk26keD1",
    description: "Label for the GitHub repository select",
  },
  connectGithubForRepository: {
    defaultMessage: "Connect GitHub to choose a repository",
    id: "StXIOq7nWw",
    description: "Placeholder when GitHub is not connected so repositories cannot be chosen",
  },
  selectChannel: {
    defaultMessage: "Select channel",
    id: "J7Yta0PrqK",
    description: "Placeholder when no Slack channel is selected",
  },
  selectConnection: {
    defaultMessage: "Select connection",
    id: "x6H592pqcv",
    description: "Placeholder when no Contentful connection is selected",
  },
  selectProject: {
    defaultMessage: "Select project",
    id: "CQAPVFsXtD",
    description: "Placeholder when no project is selected",
  },
  unknownProject: {
    defaultMessage: "Unknown project",
    id: "avoSAOCHz4",
    description: "Label when a selected project id is not in the loaded list",
  },
  projectsMenu: {
    defaultMessage: "Projects",
    id: "5OJwSyhCmS",
    description: "Dropdown label for the project selector",
  },
  unableToLoadProjects: {
    defaultMessage: "Unable to load projects",
    id: "/RotSbukS0",
    description: "Error item when projects fail to load in the selector",
  },
  noProjectsFound: {
    defaultMessage: "No projects found",
    id: "9actmxeaKu",
    description: "Empty state when there are no projects to select",
  },
  selectedShortcut: {
    defaultMessage: "Selected",
    id: "JUfajjODRg",
    description: "Shortcut hint for the currently selected project",
  },
  branchesPlaceholder: {
    defaultMessage: "Branches",
    id: "xx4TyhA9Af",
    description: "Branch pattern selector label when no branches are added",
  },
  branchPatternsMenu: {
    defaultMessage: "Branch patterns",
    id: "iL0uh6nGuj",
    description: "Dropdown label for branch pattern management",
  },
  noBranchesAdded: {
    defaultMessage: "No branches added",
    id: "Tm/8Q9uIIU",
    description: "Empty state when no branch patterns are configured",
  },
  removeShortcut: {
    defaultMessage: "Remove",
    id: "LDFu1kaYeg",
    description: "Shortcut hint to remove a branch pattern",
  },
  branchPatternAriaLabel: {
    defaultMessage: "Branch pattern",
    id: "Mo34UnIccj",
    description: "Accessible label for the branch pattern input",
  },
  addBranch: {
    defaultMessage: "Add",
    id: "uqGZNAVfVF",
    description: "Button to add a branch pattern",
  },
  addTrigger: {
    defaultMessage: "Add Trigger",
    id: "DPE4D8nJkF",
    description: "Button to open the add-trigger menu",
  },
  supportedTriggers: {
    defaultMessage: "Supported triggers",
    id: "peYw3ULGLY",
    description: "Dropdown section label for available automation triggers",
  },
  manualRun: {
    defaultMessage: "Manual run",
    id: "Ya1gnhy/x1",
    description: "Menu item to select a manual trigger",
  },
  scheduled: {
    defaultMessage: "Scheduled",
    id: "bCXvSTPFsb",
    description: "Menu item to select a scheduled trigger",
  },
  githubPush: {
    defaultMessage: "GitHub push",
    id: "6YRqpDlcKq",
    description: "Label for the GitHub push trigger",
  },
  sourceUpload: {
    defaultMessage: "Source upload",
    id: "91uWukrQcJ",
    description: "Label for the source upload trigger",
  },
  addedShortcut: {
    defaultMessage: "Added",
    id: "UQM29Qy4Ux",
    description: "Shortcut hint when a trigger or tool is already added",
  },
  connectFirstShortcut: {
    defaultMessage: "Connect first",
    id: "dYlXc1BTpY",
    description: "Shortcut hint when an integration must be connected first",
  },
  syncOnlyShortcut: {
    defaultMessage: "Sync only",
    id: "Qr6HIhIqfm",
    description: "Shortcut hint when GitHub push is unavailable because agent mode is enabled",
  },
  enableFirstShortcut: {
    defaultMessage: "Enable first",
    id: "ZQbvwhJWXn",
    description: "Shortcut hint when email must be enabled first",
  },
  triggersSection: {
    defaultMessage: "Triggers",
    id: "3kjfANjxLP",
    description: "Section heading for automation trigger settings",
  },
  every: {
    defaultMessage: "Every",
    id: "tr/WtfszIz",
    description: "Prefix label before the schedule cadence select",
  },
  cadenceHour: {
    defaultMessage: "Hour",
    id: "gXZ1TC7mZA",
    description: "Hourly schedule cadence option",
  },
  cadenceDay: {
    defaultMessage: "Day",
    id: "+ixHu5wBKG",
    description: "Daily schedule cadence option",
  },
  cadenceWeek: {
    defaultMessage: "Week",
    id: "4Iy9AzpaNC",
    description: "Weekly schedule cadence option",
  },
  at: {
    defaultMessage: "at",
    id: "yC7UjRaWKX",
    description: "Preposition between cadence and time in the schedule row",
  },
  scheduleTimezoneAriaLabel: {
    defaultMessage: "Schedule timezone",
    id: "VFS/q4p0GR",
    description: "Accessible label for the schedule timezone input",
  },
  manualOnlyTitle: {
    defaultMessage: "Manual only",
    id: "YPT/4ux3Z/",
    description: "Title when the automation only supports manual runs",
  },
  manualOnlyDescription: {
    defaultMessage: "Runs only start when a teammate queues one from this automation.",
    id: "yc2ziR1Owc",
    description: "Description for the manual-only trigger",
  },
  contentfulWebhookConnectedDescription: {
    defaultMessage: "Runs when Contentful sends a matching entry create or update webhook.",
    id: "GdV4Jl3WMg",
    description: "Description for Contentful webhook trigger when Contentful is connected",
  },
  contentfulWebhookDisconnectedDescription: {
    defaultMessage: "Connect Contentful in Integrations before this trigger can run.",
    id: "PsCe6RXT6P",
    description: "Description for Contentful webhook trigger when Contentful is not connected",
  },
  sourceUploadDescription: {
    defaultMessage: "Runs when a source file is uploaded to the project selected above.",
    id: "1QEv3c/AxW",
    description: "Description for the source upload trigger",
  },
  addTool: {
    defaultMessage: "Add Tool",
    id: "FCdijMuIQ9",
    description: "Button to open the add-tool menu",
  },
  builtInTools: {
    defaultMessage: "Built-in",
    id: "8Ktyj8rNhr",
    description: "Dropdown section label for built-in automation tools",
  },
  supportedTools: {
    defaultMessage: "Supported tools",
    id: "WsiwWcs52J",
    description: "Dropdown section label for available automation tools",
  },
  memories: {
    defaultMessage: "Memories",
    id: "mLI55faX8v",
    description: "Menu item and tool title for workspace knowledge memories",
  },
  memoriesDescription: {
    defaultMessage: "Use organization knowledge memory as guidance for this automation.",
    id: "rcdU5+Pv4r",
    description: "Description for the knowledge memories automation tool",
  },
  memoriesUnavailableDescription: {
    defaultMessage:
      "Enable workspace knowledge for this organization before using memories in automations.",
    id: "yl7Dzt+xE3",
    description: "Description when knowledge memories cannot be used yet",
  },
  manageMemories: {
    defaultMessage: "Manage",
    id: "WNUkfqHAtJ",
    description: "Button to open the knowledge memories editor from an automation",
  },
  manageMemoriesTitle: {
    defaultMessage: "Knowledge memories",
    id: "W9S7Ht69kS",
    description: "Title for the knowledge memories management sheet",
  },
  manageMemoriesDescription: {
    defaultMessage: "Edit the shared organization knowledge used by this automation.",
    id: "WBqbSdV/u8",
    description: "Description for the knowledge memories management sheet",
  },
  removeMemoriesTool: {
    defaultMessage: "Remove memories tool",
    id: "axtydiBtML",
    description: "Accessible label to remove the knowledge memories tool",
  },
  enableKnowledgeFirstShortcut: {
    defaultMessage: "Enable first",
    id: "a51/Gtv+h4",
    description: "Shortcut shown when workspace knowledge is not enabled for the organization",
  },
  useGithubRepo: {
    defaultMessage: "Use GitHub repo",
    id: "l9fbW9HiTx",
    description: "Menu item and tool title for the GitHub agent repository tool",
  },
  githubSyncWorkflows: {
    defaultMessage: "GitHub sync workflows",
    id: "wewNVYT5+w",
    description: "Menu item and tool title for GitHub sync workflows",
  },
  sendToSlack: {
    defaultMessage: "Send to Slack",
    id: "rxbmdOIAMH",
    description: "Menu item and tool title for Slack notifications",
  },
  sendEmail: {
    defaultMessage: "Send email",
    id: "8rom3KX2rX",
    description: "Menu item and tool title for email notifications",
  },
  contentfulTranslate: {
    defaultMessage: "Contentful translate",
    id: "ywFNKJfKqp",
    description: "Menu item and tool title for Contentful translation",
  },
  translate: {
    defaultMessage: "Translate",
    id: "rVbcl0T6/F",
    description: "Menu item and tool title for translation jobs",
  },
  mcpServer: {
    defaultMessage: "MCP Server",
    id: "mcpSrvTool1",
    description: "Menu item and tool title for an external MCP server connection",
  },
  mcpServerDescription: {
    defaultMessage: "Call tools from a connected remote MCP server during this automation.",
    id: "mcpSrvDesc1",
    description: "Description for the MCP Server automation tool when a connection exists",
  },
  mcpServerDisconnectedDescription: {
    defaultMessage: "Connect an MCP server in Integrations before using this tool.",
    id: "mcpSrvDisc1",
    description: "Description when no MCP server connection is available",
  },
  removeMcpServerTool: {
    defaultMessage: "Remove MCP Server tool",
    id: "mcpSrvRm01",
    description: "Accessible label to remove the MCP Server tool",
  },
  comingSoon: {
    defaultMessage: "Coming soon",
    id: "lvwFhMaVAT",
    description: "Dropdown section label for tools that are not yet available",
  },
  contentfulTargetLocalesEmpty: {
    defaultMessage: "Select a Contentful connection to choose target locales.",
    id: "DCeid5ejmn",
    description: "Empty state when Contentful target locales cannot be chosen yet",
  },
  toolsSection: {
    defaultMessage: "Tools",
    id: "Z39eNFe81L",
    description: "Section heading for automation tool settings",
  },
  useGithubRepoDescription: {
    defaultMessage:
      "Read the repository and follow your instructions. GitHub skills apply automatically.",
    id: "hpOVndgWkJ",
    description: "Description for the GitHub agent repository tool",
  },
  removeGithubRepoTool: {
    defaultMessage: "Remove GitHub repo tool",
    id: "Dz+BYN4QJV",
    description: "Accessible label to remove the GitHub agent repository tool",
  },
  githubSyncWorkflowsDescription: {
    defaultMessage: "Push source, pull translations, and validation checks.",
    id: "YJJ6zC95OW",
    description: "Description for GitHub sync workflows",
  },
  removeGithubSyncWorkflows: {
    defaultMessage: "Remove GitHub sync workflows",
    id: "FlXBmFercA",
    description: "Accessible label to remove GitHub sync workflows",
  },
  pushSource: {
    defaultMessage: "Push source",
    id: "CXxeX4tNjR",
    description: "Toggle label for the push source GitHub sync workflow",
  },
  pullTranslations: {
    defaultMessage: "Pull translations",
    id: "N1gb0F1ogJ",
    description: "Toggle label for the pull translations GitHub sync workflow",
  },
  validation: {
    defaultMessage: "Validation",
    id: "jCbFiXpIeD",
    description: "Toggle label for the validation GitHub sync workflow",
  },
  connectFirstBadge: {
    defaultMessage: "Connect first",
    id: "e9TsGisohb",
    description: "Badge when a tool requires connecting an integration first",
  },
  enableFirstBadge: {
    defaultMessage: "Enable first",
    id: "33PBu8aQXh",
    description: "Badge when email notifications require enabling the email agent first",
  },
  slackConnectedDescription: {
    defaultMessage: "Notify a channel when runs reach a terminal state.",
    id: "7vHEse/Aa+",
    description: "Description for Slack notifications when Slack is connected",
  },
  slackDisconnectedDescription: {
    defaultMessage: "Connect Slack in <link>Integrations</link> to use this tool.",
    id: "so9cmZxAcw",
    description: "Description for Slack notifications when Slack is not connected",
  },
  removeSlackNotifications: {
    defaultMessage: "Remove Slack notifications",
    id: "r8GjXoDLd7",
    description: "Accessible label to remove Slack notifications",
  },
  channelLabel: {
    defaultMessage: "Channel",
    id: "T8F8lD+KK1",
    description: "Label for the Slack channel select",
  },
  loadingChannels: {
    defaultMessage: "Loading channels...",
    id: "D0mCtflyKZ",
    description: "Placeholder while Slack channels are loading",
  },
  noChannelsFound: {
    defaultMessage: "No channels found",
    id: "AiZ8NmX54q",
    description: "Empty state when no Slack channels are available",
  },
  privateChannelSuffix: {
    defaultMessage: "#{name} (private)",
    id: "PYB6jMwARG",
    description: "Slack channel option label for a private channel",
  },
  publicChannelLabel: {
    defaultMessage: "#{name}",
    id: "ZH8KR1tpOB",
    description: "Slack channel option label for a public channel",
  },
  emailConnectedDescription: {
    defaultMessage: "Send terminal run summaries to specific recipients.",
    id: "DdTfqNy1em",
    description: "Description for email notifications when email is enabled",
  },
  emailDisconnectedDescription: {
    defaultMessage:
      "Enable the email agent in <link>Integrations</link> to use email notifications.",
    id: "QlWnr3uEAw",
    description: "Description for email notifications when email is not enabled",
  },
  removeEmailNotifications: {
    defaultMessage: "Remove email notifications",
    id: "/fmhRd2i7v",
    description: "Accessible label to remove email notifications",
  },
  recipientsLabel: {
    defaultMessage: "Recipients",
    id: "S7JuKVNtvx",
    description: "Label for the email recipients field",
  },
  contentfulTranslateConnectedDescription: {
    defaultMessage:
      "Translate detected Contentful fields, run QA, and write drafts back for review.",
    id: "t11/mMIbiZ",
    description: "Description for Contentful translate when Contentful is connected",
  },
  contentfulTranslateDisconnectedDescription: {
    defaultMessage: "Connect Contentful in <link>Integrations</link> to use this tool.",
    id: "E0kqf33f8D",
    description: "Description for Contentful translate when Contentful is not connected",
  },
  removeContentfulTranslate: {
    defaultMessage: "Remove Contentful translate",
    id: "8pW28B/viJ",
    description: "Accessible label to remove the Contentful translate tool",
  },
  connectionLabel: {
    defaultMessage: "Connection",
    id: "BntV+FD+ax",
    description: "Label for the Contentful connection select",
  },
  connectionDisabledSuffix: {
    defaultMessage: "{name} (disabled)",
    id: "dCR6D4Achx",
    description: "Contentful connection option label when the connection is disabled",
  },
  projectLabel: {
    defaultMessage: "Project",
    id: "JqELr8GP9s",
    description: "Label for the project select in Contentful settings",
  },
  entryIdLabel: {
    defaultMessage: "Entry ID",
    id: "auMBZJ74kN",
    description: "Label for the Contentful entry ID field",
  },
  contentfulEntryIdPlaceholder: {
    defaultMessage: "Contentful entry ID",
    id: "YDQwelYneJ",
    description: "Placeholder for the Contentful entry ID input",
  },
  targetLocalesLabel: {
    defaultMessage: "Target locales",
    id: "45uXWs1VTb",
    description: "Label for the target locales picker",
  },
  runQa: {
    defaultMessage: "Run QA",
    id: "Y89oWQA4Iq",
    description: "Toggle label for running QA on Contentful translations",
  },
  writeDrafts: {
    defaultMessage: "Write drafts",
    id: "tHTaRJpN/S",
    description: "Toggle label for writing Contentful drafts",
  },
  overwriteTargets: {
    defaultMessage: "Overwrite targets",
    id: "GuEU+qQCHt",
    description: "Toggle label for overwriting Contentful target locales",
  },
  translateDescription: {
    defaultMessage:
      "Queue translation jobs for uploaded source files in the project selected above.",
    id: "1AN+Q/JkbE",
    description: "Description for the translate tool",
  },
  removeTranslate: {
    defaultMessage: "Remove Translate",
    id: "xKI0yR66AU",
    description: "Accessible label to remove the translate tool",
  },
  useProjectTargetLocales: {
    defaultMessage: "Use project target locales",
    id: "gDkh3u6Ds/",
    description: "Toggle label to use the project’s configured target locales",
  },
  chooseProjectForTargetLocales: {
    defaultMessage: "Choose a project above to pick target locales.",
    id: "dn9Ff93vY2",
    description: "Empty state when translation target locales need a project first",
  },
  noRunsYet: {
    defaultMessage: "No runs yet.",
    id: "kSA5sHlbN9",
    description: "Empty state when an automation has no run history",
  },
  historyStatus: {
    defaultMessage: "Status",
    id: "tK7acLhoUb",
    description: "Run history column header for status",
  },
  historyTrigger: {
    defaultMessage: "Trigger",
    id: "B49vrN6vd7",
    description: "Run history column header for trigger source",
  },
  historySummary: {
    defaultMessage: "Summary",
    id: "gfTpniOS4y",
    description: "Run history column header for output summary",
  },
  historyCompleted: {
    defaultMessage: "Completed",
    id: "SKhTQyZkDY",
    description: "Run history column header for completion time",
  },
  runStatusQueued: {
    defaultMessage: "Queued",
    id: "x8HYMdg8Zs",
    description: "Automation run status badge for queued",
  },
  runStatusRunning: {
    defaultMessage: "Running",
    id: "2QksXdo4Pa",
    description: "Automation run status badge for running",
  },
  runStatusSucceeded: {
    defaultMessage: "Succeeded",
    id: "N9BYBbfFW0",
    description: "Automation run status badge for succeeded",
  },
  runStatusFailed: {
    defaultMessage: "Failed",
    id: "ImJlsQdxZz",
    description: "Automation run status badge for failed",
  },
  runStatusCancelled: {
    defaultMessage: "Cancelled",
    id: "jbZqr4hs7O",
    description: "Automation run status badge for cancelled",
  },
  runStatusSkipped: {
    defaultMessage: "Skipped",
    id: "rDkQbK1OIB",
    description: "Automation run status badge for skipped",
  },
  triggerSourceManual: {
    defaultMessage: "Manual",
    id: "xkthiVH+yt",
    description: "Run history trigger source for manual runs",
  },
  triggerSourceScheduled: {
    defaultMessage: "Scheduled",
    id: "R7vhxRuwOx",
    description: "Run history trigger source for scheduled runs",
  },
  triggerSourceGithub: {
    defaultMessage: "GitHub",
    id: "USEpvu/QYB",
    description: "Run history trigger source for GitHub runs",
  },
  triggerSourceContentful: {
    defaultMessage: "Contentful",
    id: "RDYoEaU2oe",
    description: "Run history trigger source for Contentful runs",
  },
  triggerSourceSourceUpload: {
    defaultMessage: "Source upload",
    id: "HS6xLp94fT",
    description: "Run history trigger source for source upload runs",
  },
  automationNameLabel: {
    defaultMessage: "Automation name",
    id: "0wt+Elr1cE",
    description: "Accessible label for the automation name field",
  },
  untitledAutomationPlaceholder: {
    defaultMessage: "Untitled automation",
    id: "DTYOuQdye9",
    description: "Placeholder for the automation name field",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "ibTu9Z1u2B",
    description: "Status toggle label when the automation is active",
  },
  statusPaused: {
    defaultMessage: "Paused",
    id: "Zm6E60imOZ",
    description: "Status toggle label when the automation is paused",
  },
  toolCount: {
    defaultMessage: "{count, plural, one {# tool} other {# tools}}",
    id: "6z9r7qs8fj",
    description: "Summary of how many tools are configured on the automation",
  },
  activateRequiresTool: {
    defaultMessage: "Add at least one supported tool to activate this automation.",
    id: "QL/gA8x5xr",
    description: "Hint when the automation cannot be activated without a tool",
  },
  settingsTab: {
    defaultMessage: "Settings",
    id: "+0cpswe8Tj",
    description: "Tab label for automation settings",
  },
  runHistoryTab: {
    defaultMessage: "Run History",
    id: "GERghL+Meu",
    description: "Tab label for automation run history",
  },
  agentInstructionsSection: {
    defaultMessage: "Agent Instructions",
    id: "Ej5U0a0604",
    description: "Section heading for automation agent instructions",
  },
  instructionsPlaceholder: {
    defaultMessage: "Tell the automation what to do, what to inspect, and what to ignore.",
    id: "rkQ7AmKMrt",
    description: "Placeholder for the automation instructions textarea",
  },
});
