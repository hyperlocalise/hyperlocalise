"use client";

import { defineMessages } from "react-intl";

export const repositoryAutomationSettingsPanelMessages = defineMessages({
  selectProjectPlaceholder: {
    defaultMessage: "Select a project",
    id: "heSbClUFGX",
    description: "Placeholder for Hyperlocalise project select fields",
  },
  loadSettingsFailed: {
    defaultMessage: "Failed to load automation settings",
    id: "dYBH3h8+RK",
    description: "Error when repository automation settings fail to load",
  },
  loadProjectsFailed: {
    defaultMessage: "Failed to load projects",
    id: "mMsPU5+otj",
    description: "Error when organization projects fail to load for automation settings",
  },
  saveFailedToast: {
    defaultMessage: "Could not save automation settings",
    id: "Y3BPUJdmMR",
    description: "Toast when repository automation settings save fails",
  },
  saveSuccessToast: {
    defaultMessage: "Automation settings saved",
    id: "lO+u6H8vSf",
    description: "Toast after repository automation settings are saved",
  },
  resetFailed: {
    defaultMessage: "Failed to reset automation settings",
    id: "9Ixpy5poXF",
    description: "Error when repository automation settings reset fails",
  },
  resetSuccessToast: {
    defaultMessage: "Automation settings reset",
    id: "MR4r0hcWXP",
    description: "Toast after repository automation settings are reset",
  },
  triggerOff: {
    defaultMessage: "Off",
    id: "sp82GiYbAh",
    description: "Trigger mode option when automation triggers are disabled",
  },
  triggerOnPush: {
    defaultMessage: "On push",
    id: "2kT6l4vS6b",
    description: "Trigger mode option when automation runs on git push",
  },
  triggerScheduled: {
    defaultMessage: "Scheduled",
    id: "Up6UMTbrGA",
    description: "Trigger mode option when automation runs on a schedule",
  },
  enableRepositoryHint: {
    defaultMessage: "Enable this repository to configure translation automation.",
    id: "JUWqOD5PWj",
    description:
      "Hint shown when repository automation cannot be configured because repo is disabled",
  },
  archivedRepositoryHint: {
    defaultMessage: "Archived repositories cannot use translation automation.",
    id: "UP0P0zCDA/",
    description:
      "Hint shown when repository automation cannot be configured because repo is archived",
  },
  loadError: {
    defaultMessage: "Unable to load automation settings.",
    id: "kvuiTkSvGX",
    description: "Error message when automation settings query fails",
  },
  retry: {
    defaultMessage: "Retry",
    id: "YPUY3Uik30",
    description: "Button label to retry loading automation settings",
  },
  intro: {
    defaultMessage:
      "Configure how Hyperlocalise syncs source strings and translations for <repositoryName>{repositoryFullName}</repositoryName>.",
    id: "hSh2lnNLxs",
    description: "Introduction text for repository automation settings",
  },
  openFullPageEditor: {
    defaultMessage: "Open full-page editor",
    id: "VdjibQd9gV",
    description: "Link to open repository automation settings on a dedicated page",
  },
  workflowsTitle: {
    defaultMessage: "Workflows",
    id: "J5QEeAEILc",
    description: "Section heading for automation workflow toggles",
  },
  workflowsDescription: {
    defaultMessage: "Choose which automation jobs run for this repository.",
    id: "uUnWGsYCBS",
    description: "Section description for automation workflow toggles",
  },
  pushSourceLabel: {
    defaultMessage: "Push source to Hyperlocalise",
    id: "9KmYVi7cCO",
    description: "Label for the push source workflow toggle",
  },
  pushSourceDescription: {
    defaultMessage: "Import source strings from GitHub into your TMS project.",
    id: "xkkgs3AOHS",
    description: "Description for the push source workflow toggle",
  },
  hyperlocaliseProjectLabel: {
    defaultMessage: "Hyperlocalise project",
    id: "F60WBL3vGu",
    description: "Label for project select fields in automation settings",
  },
  pushSourceProjectDescription: {
    defaultMessage: "Source strings are pushed into this project.",
    id: "6xwxjrmrdy",
    description: "Description for the push source project select field",
  },
  pullTranslationsLabel: {
    defaultMessage: "Pull translations to GitHub",
    id: "4Qb5sAFHM8",
    description: "Label for the pull translations workflow toggle",
  },
  pullTranslationsDescription: {
    defaultMessage: "Opens a pull request with updated translation files when sync succeeds.",
    id: "33ZcrkXcDM",
    description: "Description for the pull translations workflow toggle",
  },
  pullTranslationsProjectDescription: {
    defaultMessage: "Translations are read from this project before opening the pull request.",
    id: "n+jmfgFlG0",
    description: "Description for the pull translations project select field",
  },
  validationLabel: {
    defaultMessage: "Localization check",
    id: "BjoXu+/Pje",
    description: "Label for the localization validation workflow toggle",
  },
  validationDescription: {
    defaultMessage: "Runs <command>hl check</command> against repository translation files.",
    id: "yXOtXZjqsN",
    description: "Description for the localization validation workflow toggle",
  },
  validationBlockLabel: {
    defaultMessage: "Block on failure",
    id: "477uPaXfz1",
    description: "Label for blocking automation when localization check fails",
  },
  validationBlockDescription: {
    defaultMessage: "Fail the automation run when the localization check reports errors.",
    id: "cjBFGkHog4",
    description: "Description for blocking automation when localization check fails",
  },
  triggerTitle: {
    defaultMessage: "Trigger",
    id: "WuN0lCA6yk",
    description: "Section heading for automation trigger settings",
  },
  triggerDescription: {
    defaultMessage: "Push and scheduled triggers are mutually exclusive.",
    id: "mE9BVZ+4OT",
    description: "Section description for automation trigger settings",
  },
  branchPatternsLabel: {
    defaultMessage: "Branch patterns",
    id: "dW35I3VMSZ",
    description: "Label for branch pattern input in push trigger settings",
  },
  branchPatternsDescription: {
    defaultMessage:
      "Use glob patterns such as <mainExample>main</mainExample> or <releaseExample>release/*</releaseExample>. Up to 32 patterns.",
    id: "3AEM15DaMz",
    description: "Description for branch pattern input in push trigger settings",
  },
  branchPatternPlaceholder: {
    defaultMessage: "main",
    id: "vK7GusCjy3",
    description: "Placeholder for branch pattern input",
  },
  addBranchPattern: {
    defaultMessage: "Add",
    id: "xovEZE5T2r",
    description: "Button label to add a branch pattern",
  },
  removeBranchPatternAriaLabel: {
    defaultMessage: "Remove {branch}",
    id: "g5YfEeVlsF",
    description: "Aria label for removing a branch pattern badge",
  },
  cadenceLabel: {
    defaultMessage: "Cadence",
    id: "usZU30knmw",
    description: "Label for scheduled automation cadence select",
  },
  cadenceHourly: {
    defaultMessage: "Hourly",
    id: "TR2IFwpfx/",
    description: "Scheduled cadence option for hourly runs",
  },
  cadenceDaily: {
    defaultMessage: "Daily",
    id: "1V22/7VZBT",
    description: "Scheduled cadence option for daily runs",
  },
  cadenceWeekly: {
    defaultMessage: "Weekly",
    id: "Y19LAzxjpx",
    description: "Scheduled cadence option for weekly runs",
  },
  scheduledHourLabel: {
    defaultMessage: "Hour (UTC)",
    id: "BrsVyR4Efb",
    description: "Label for scheduled automation hour select",
  },
  scheduledHourOption: {
    defaultMessage: "{hour}:00 UTC",
    id: "6xU6c/eKvO",
    description: "Option label for a scheduled automation hour in UTC",
  },
  scheduledDayLabel: {
    defaultMessage: "Day of week",
    id: "wBNC3JBHju",
    description: "Label for scheduled automation day-of-week select",
  },
  scheduledTimezoneLabel: {
    defaultMessage: "Timezone",
    id: "XMHsfUaoDt",
    description: "Label for scheduled automation timezone input",
  },
  scheduledTimezonePlaceholder: {
    defaultMessage: "UTC",
    id: "Zy8ZOSNNhB",
    description: "Placeholder for scheduled automation timezone input",
  },
  statusCheckTitle: {
    defaultMessage: "GitHub status check",
    id: "WZko2fwHOK",
    description: "Section heading for GitHub status check settings",
  },
  statusCheckDescription: {
    defaultMessage:
      "Publish a check run so teams can see localization results on commits and pull requests.",
    id: "lmsnisjyr6",
    description: "Section description for GitHub status check settings",
  },
  statusCheckEnabledLabel: {
    defaultMessage: "Enable check run",
    id: "NPcxGbshkv",
    description: "Label for enabling GitHub status checks",
  },
  statusCheckEnabledDescription: {
    defaultMessage: "Shows localization automation status in GitHub Checks.",
    id: "+WcpU6CzaH",
    description: "Description for enabling GitHub status checks",
  },
  statusCheckModeLabel: {
    defaultMessage: "Check mode",
    id: "rhfG3eu2aR",
    description: "Label for GitHub status check mode select",
  },
  statusCheckAdvisory: {
    defaultMessage: "Advisory",
    id: "3gBCC4Vt7Q",
    description: "GitHub status check mode that reports results without blocking",
  },
  statusCheckBlocking: {
    defaultMessage: "Blocking",
    id: "/9tSalqpWn",
    description: "GitHub status check mode that can block pull requests",
  },
  statusCheckBlockingDescription: {
    defaultMessage:
      "Blocking checks can fail pull requests when combined with <link>branch protection rules</link>.",
    id: "orN5K1E2Yc",
    description: "Description for blocking GitHub status check mode",
  },
  configVersion: {
    defaultMessage: "Config version: <version>{configVersion}</version>",
    id: "3r10YA/kX+",
    description: "Metadata label showing saved automation config version",
  },
  nextScheduledRun: {
    defaultMessage: "Next scheduled run: <time>{nextRunAt}</time>",
    id: "L7iavACo3u",
    description: "Metadata label showing next scheduled automation run time",
  },
  resetSettings: {
    defaultMessage: "Reset settings",
    id: "EZ0iYWNVvs",
    description: "Button label to reset repository automation settings",
  },
  saveSettings: {
    defaultMessage: "Save settings",
    id: "U7qjKZzoBx",
    description: "Button label to save repository automation settings",
  },
  savingSettings: {
    defaultMessage: "Saving...",
    id: "nJUCs4vSKi",
    description: "Button label while repository automation settings are saving",
  },
  resetDialogTitle: {
    defaultMessage: "Reset automation settings?",
    id: "TpaF4AqL/5",
    description: "Confirmation dialog title for resetting automation settings",
  },
  resetDialogDescription: {
    defaultMessage:
      "This clears saved workflows, triggers, and status check settings for this repository. GitHub metadata sync is not affected.",
    id: "G8MBSDjILS",
    description: "Confirmation dialog description for resetting automation settings",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "ODcZRmwDmR",
    description: "Cancel button label in reset automation settings dialog",
  },
  resettingSettings: {
    defaultMessage: "Resetting...",
    id: "ALRaijWLiy",
    description: "Button label while repository automation settings are resetting",
  },
});
