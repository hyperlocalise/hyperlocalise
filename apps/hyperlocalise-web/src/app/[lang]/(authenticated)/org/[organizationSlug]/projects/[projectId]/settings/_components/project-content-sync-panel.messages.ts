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

export const projectContentSyncPanelMessages = defineMessages({
  title: {
    defaultMessage: "Sync",
    id: "kNzPwDjtB/",
    description: "Heading of the project settings panel that syncs files with a repository",
  },
  description: {
    defaultMessage:
      "Bring source files in from a repository and send finished translations back as a pull request or merge request.",
    id: "bSZGRrVpZH",
    description: "Description of the project Sync panel",
  },
  loadError: {
    defaultMessage: "Unable to load sync settings.",
    id: "CTGr9CwLJv",
    description: "Error shown when the project sync settings fail to load",
  },
  saveError: {
    defaultMessage: "Unable to save sync settings.",
    id: "cN7lGns1+R",
    description: "Error shown when saving the project sync settings fails",
  },
  saved: {
    defaultMessage: "Sync settings saved.",
    id: "ELF+12oSuA",
    description: "Toast shown after the project sync settings are saved",
  },
  repositoryLabel: {
    defaultMessage: "Repository",
    id: "6HbWUjcTj7",
    description: "Label for the repository picker in the project Sync panel",
  },
  repositoryPlaceholder: {
    defaultMessage: "Choose a repository",
    id: "Mj8cMFDFRg",
    description: "Placeholder for the repository picker in the project Sync panel",
  },
  noRepositories: {
    defaultMessage:
      "Connect GitLab in Integrations to sync this project. A GitHub repository syncs from its Automation settings there.",
    id: "BL4Aw/xqvM",
    description:
      "Shown in the project Sync panel when the workspace has no GitLab connection and the project has no sync",
  },
  openIntegrations: {
    defaultMessage: "Open Integrations",
    id: "gsrh5zQdZC",
    description: "Link from the project Sync panel to the Integrations page",
  },
  providerFolderLabel: {
    defaultMessage: "Repository folder",
    id: "1U++3URWS4",
    description: "Label for the repository folder field in the project Sync panel",
  },
  providerFolderHelp: {
    defaultMessage:
      "The folder in the repository that holds the source files, for example locales.",
    id: "m4iVRIAaW3",
    description: "Help text for the repository folder field in the project Sync panel",
  },
  projectFolderLabel: {
    defaultMessage: "Project folder",
    id: "ai2FI9MiCn",
    description: "Label for the project folder field in the project Sync panel",
  },
  projectFolderHelp: {
    defaultMessage: "Where the files appear in this project.",
    id: "sOfLCiMyCh",
    description: "Help text for the project folder field in the project Sync panel",
  },
  scheduleLabel: {
    defaultMessage: "Schedule",
    id: "qxAtQr1hgC",
    description: "Label for the schedule picker in the project Sync panel",
  },
  scheduleManual: {
    defaultMessage: "Only when I click Sync now",
    id: "JRHfM8uH3R",
    description: "Schedule option: the project syncs only when someone clicks Sync now",
  },
  scheduleHourly: {
    defaultMessage: "Every hour",
    id: "EIpgZS0MVO",
    description: "Schedule option: the project syncs every hour",
  },
  scheduleDaily: {
    defaultMessage: "Every day",
    id: "lvk9CHFHpK",
    description: "Schedule option: the project syncs once a day",
  },
  nextRun: {
    defaultMessage: "Next scheduled sync: {time}",
    id: "a1QYZOb8v/",
    description: "Shows when the next scheduled project sync will start",
  },
  save: {
    defaultMessage: "Save",
    id: "OawVGF0jzY",
    description: "Button that saves the project sync settings",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "qtB7+3Uye/",
    description: "Save button text while the project sync settings are saving",
  },
  syncNow: {
    defaultMessage: "Sync now",
    id: "HgPHDYcLMY",
    description: "Button that starts a project sync at once",
  },
  syncStarted: {
    defaultMessage: "Sync started.",
    id: "izSm4OVUTX",
    description: "Toast shown after Sync now starts a project sync",
  },
  syncStartError: {
    defaultMessage: "Unable to start the sync.",
    id: "erwKpxK+ds",
    description: "Error shown when Sync now fails to start a project sync",
  },
  syncInProgress: {
    defaultMessage: "A sync is already running.",
    id: "AVXDmG66Yd",
    description: "Error shown when Sync now is clicked while a project sync is running",
  },
  saveBeforeSync: {
    defaultMessage: "Save your changes before syncing.",
    id: "e54flb2PR8",
    description:
      "Hint shown when Sync now is disabled because the sync settings have unsaved edits",
  },
  remove: {
    defaultMessage: "Remove sync",
    id: "S3Dsv7C7Nh",
    description: "Button that removes the project's sync settings",
  },
  removeTitle: {
    defaultMessage: "Remove this project's sync?",
    id: "qy3PLCUa/e",
    description: "Title of the dialog confirming removal of the project sync settings",
  },
  removeDescription: {
    defaultMessage:
      "The settings and the run history are deleted. Files already in the project stay.",
    id: "pnBGoxuR5t",
    description: "Description of the dialog confirming removal of the project sync settings",
  },
  removeCancel: {
    defaultMessage: "Cancel",
    id: "qCA5FK7jVt",
    description: "Cancel button in the dialog confirming removal of the project sync settings",
  },
  removeConfirm: {
    defaultMessage: "Remove",
    id: "nWS380YnWC",
    description: "Confirm button in the dialog confirming removal of the project sync settings",
  },
  removed: {
    defaultMessage: "Sync removed.",
    id: "dfPeYtLjRq",
    description: "Toast shown after the project sync settings are removed",
  },
  removeError: {
    defaultMessage: "Unable to remove the sync.",
    id: "RaStbLcbsa",
    description: "Error shown when removing the project sync settings fails",
  },
  readOnly: {
    defaultMessage: "You can see these settings but not change them.",
    id: "2BDMq4KV+/",
    description:
      "Note shown in the project Sync panel to people who cannot change project settings",
  },
  runsTitle: {
    defaultMessage: "Recent syncs",
    id: "4oWir+lPBP",
    description: "Heading of the list of recent project sync runs",
  },
  noRuns: {
    defaultMessage: "No syncs yet.",
    id: "vrbsvX/uWN",
    description: "Shown when the project has no sync runs",
  },
  runRunning: {
    defaultMessage: "Running",
    id: "um3tvZk8RN",
    description: "Status of a project sync run that has not finished",
  },
  runSucceeded: {
    defaultMessage: "Succeeded",
    id: "Ol/CLajqiN",
    description: "Status of a project sync run that finished without errors",
  },
  runFailed: {
    defaultMessage: "Failed",
    id: "DCn9Wmv+Wt",
    description: "Status of a project sync run that failed",
  },
  runManual: {
    defaultMessage: "Started by hand",
    id: "G1iUqTOOGV",
    description: "Shows that a project sync run was started with Sync now",
  },
  runScheduled: {
    defaultMessage: "Scheduled",
    id: "RtFvRzHXme",
    description: "Shows that a project sync run was started by its schedule",
  },
  runPulled: {
    defaultMessage:
      "{uploaded, plural, one {# file imported} other {# files imported}}, {skipped, number} unchanged",
    id: "sBD3fLEfW2",
    description: "Summary of the source files a project sync run imported",
  },
  runWritten: {
    defaultMessage:
      "{written, plural, =0 {No new translations to send} one {# translated file sent} other {# translated files sent}}",
    id: "ObksDhMzPR",
    description: "Summary of the translated files a project sync run sent back to the repository",
  },
  runHeldBack: {
    defaultMessage:
      "{held, plural, one {# language file waits} other {# language files wait}} until every translation in it is approved",
    id: "e4UP1KeoEn",
    description:
      "Count of language files a GitLab sync run held back because a page is sent whole, once fully approved",
  },
  runNotSent: {
    defaultMessage:
      "{count, plural, one {# file wasn't sent back} other {# files weren't sent back}}: the format isn't supported yet, or the repository's copy couldn't be read",
    id: "YvKNfbM9SW",
    description: "Count of source files a GitLab sync run couldn't write a language file for",
  },
  runListsHeldBack: {
    defaultMessage:
      "{count, plural, one {# list was left as the repository has it} other {# lists were left as the repository has them}} until every item in it is approved",
    id: "gLwbnoGaiP",
    description:
      "Count of JSON lists a GitLab sync run left unchanged because an item had no approved text",
  },
  runConflicts: {
    defaultMessage:
      "{count, plural, one {# language file wasn't sent because two source files would write it} other {# language files weren't sent because two source files would write them}}",
    id: "zyZLiFVz+9",
    description:
      "Count of language files a GitLab sync run skipped because two source files map to the same file",
  },
  runPushError: {
    defaultMessage: "Translations weren't sent: {reason}",
    id: "UOMRfGQ0jp",
    description:
      "Shown on a GitLab sync run whose pull succeeded but whose write GitLab refused; the reason is GitLab's",
  },
  openPullRequest: {
    defaultMessage: "Open pull request",
    id: "3V79KDlgh2",
    description: "Link to the pull request a project sync run opened",
  },
  openMergeRequest: {
    defaultMessage: "Open merge request",
    id: "NRQuibW48k",
    description: "Link to the merge request a GitLab project sync run opened",
  },
  githubBehaviour: {
    defaultMessage:
      "A GitHub sync clones the repository, deletes keys the repository dropped, and sends every translation except rejected ones back in a pull request, reviewed or not.",
    id: "4JyzfnXrai",
    description:
      "Note under the repository service picker while GitHub is chosen, saying what a GitHub sync does",
  },
  gitlabBehaviour: {
    defaultMessage:
      "A GitLab sync reads the repository through its API, hides keys the repository dropped, and sends approved translations back in a merge request.",
    id: "VDeyA5c96f",
    description:
      "Note under the repository service picker while GitLab is chosen, saying what a GitLab sync does",
  },
  branchFromIntegrations: {
    defaultMessage: "The repository's default branch on GitHub. A GitHub sync always reads it.",
    id: "plPoWuOVzN",
    description: "Help text under the read-only branch field of a GitHub project sync",
  },
  providerFolderHelpGithub: {
    defaultMessage:
      "The folder in the repository that holds the source files, for example locales. Every supported file in it is imported.",
    id: "tz78TaaqjA",
    description: "Help text for the repository folder field of a GitHub project sync",
  },
  notSetUp: {
    defaultMessage: "No sync is set up for this project.",
    id: "stTMDlHaoL",
    description:
      "Shown in the project Sync panel to people who cannot change it when no sync is set up",
  },
  syncRunning: {
    defaultMessage: "A sync is running. You can start another when it finishes.",
    id: "9/rHOO9Hcc",
    description: "Shown in the project Sync panel while a sync run is going",
  },
  providerFolderPlaceholder: {
    defaultMessage: "locales",
    id: "YLY+U5/DGl",
    description:
      "Example repository folder shown in the empty repository folder field of the project Sync panel",
  },
  loadConnectionsError: {
    defaultMessage: "Unable to load the repositories. Reload the page to try again.",
    id: "fkrYmhHuuT",
    description:
      "Error shown when the list of repositories for the project Sync panel fails to load",
  },
  errorFieldsRequired: {
    defaultMessage: "Choose a repository and fill in both folders.",
    id: "uyNK3DRlM0",
    description:
      "Error shown when the project sync settings are saved with a missing repository or folder",
  },
  errorFolderUnsafe: {
    defaultMessage: "Use a folder path inside the repository, such as locales.",
    id: "dSbL+8m8KU",
    description:
      "Error shown when a folder in the project sync settings is not a safe relative path",
  },
  errorRepositoryNotEnabled: {
    defaultMessage:
      "This repository is not enabled in Integrations. Enable it there or choose another one.",
    id: "bTTUPk+i8t",
    description:
      "Shown when the repository chosen for the project sync is not enabled in Integrations",
  },
  errorAutomationOverlap: {
    defaultMessage:
      "A content sync automation already syncs this repository folder into the project. Pause it on the Automations page first.",
    id: "nouZfHJYX6",
    description:
      "Error shown when saving the project sync while an active content sync automation covers the same repository folder",
  },
  runFolderMissing: {
    defaultMessage: "The repository folder was not found or could not be read.",
    id: "BxGtFLZNTw",
    description: "Error shown for a project sync run whose repository folder was missing",
  },
  runPullFailed: {
    defaultMessage: "Some source files could not be imported.",
    id: "zeRvYqj5Gy",
    description: "Error shown for a project sync run where some source files failed to import",
  },
  runStale: {
    defaultMessage: "The sync did not finish in time.",
    id: "0ulsI+XIyW",
    description: "Error shown for a project sync run that stopped responding",
  },
  runUnexpected: {
    defaultMessage: "The sync stopped unexpectedly.",
    id: "RRTJeJffFC",
    description: "Error shown for a project sync run that failed for an unexpected reason",
  },
  removeInProgress: {
    defaultMessage: "A sync is running. Remove the sync once it finishes.",
    id: "Yj1IVsPHUq",
    description: "Error shown when removing the project sync while a sync run is going",
  },
  errorSyncRemoved: {
    defaultMessage: "This sync was removed. Reload the page to set it up again.",
    id: "/FxKqT7rxo",
    description:
      "Error shown when Sync now is clicked for a project sync that someone else removed",
  },
  providerLabel: {
    defaultMessage: "Repository service",
    id: "TX+fYK8q8U",
    description: "Label for the picker of the service (GitHub or GitLab) the project syncs with",
  },
  providerNotSetUp: {
    defaultMessage: "Not set up",
    id: "O9WSf08ndF",
    description:
      "Shown next to GitHub or GitLab in the project Sync panel's service picker when that service isn't set up in Integrations",
  },
  providerNotAvailable: {
    defaultMessage: "Not available",
    id: "hZbM3bN0LI",
    description:
      "Shown next to GitHub in the project Sync panel's service picker, where GitHub can't be chosen for now",
  },
  githubInIntegrations: {
    defaultMessage: "Sync a GitHub repository from its Automation settings in Integrations.",
    id: "XGVaZ97qQ9",
    description:
      "Says where GitHub syncs are set up, in place of the project Sync panel; shown under its service picker and when a GitHub sync is refused",
  },
  noGitHubRepositories: {
    defaultMessage: "Enable a GitHub repository in Integrations to sync from GitHub.",
    id: "sUzlcXbcY3",
    description:
      "Shown in the project Sync panel when GitHub is chosen and no repository is enabled",
  },
  noGitLabConnection: {
    defaultMessage: "Connect GitLab in Integrations to sync from GitLab.",
    id: "Diw4K6SV2n",
    description:
      "Shown in the project Sync panel when GitLab is chosen and the workspace has no GitLab connection",
  },
  noGitLabRepositories: {
    defaultMessage: "The workspace's GitLab token can't see any repositories.",
    id: "mYbmbB/GF/",
    description: "Shown in the project Sync panel when the GitLab connection lists no repositories",
  },
  gitlabUnavailable: {
    defaultMessage: "Unable to list the GitLab repositories. Check the connection in Integrations.",
    id: "wfI6r/Q+hm",
    description: "Shown in the project Sync panel when the GitLab repositories can't be read",
  },
  branchLabel: {
    defaultMessage: "Branch",
    id: "llq1zCo/D6",
    description: "Label for the repository branch field in the project Sync panel",
  },
  branchPlaceholder: {
    defaultMessage: "Default branch",
    id: "gRXUWrsLcF",
    description: "Placeholder of the branch field when the repository's default branch is used",
  },
  branchHelp: {
    defaultMessage: "Leave empty to read the repository's default branch.",
    id: "uPwlCtMJAb",
    description: "Help text for the branch field in the project Sync panel",
  },
  pathTemplateLabel: {
    defaultMessage: "Language file paths",
    id: "3yWat7D9eo",
    description: "Label for the field that says where each language's files are in the repository",
  },
  pathTemplatePlaceholder: {
    defaultMessage: "for example {example}",
    id: "MnS30u+aA3",
    description: "Placeholder of the language file paths field, showing an example value",
  },
  pathTemplateHelp: {
    defaultMessage:
      "Where each language's files sit under the repository folder, with {placeholder} for the language code: fr names your one French language, fr-FR names only fr-FR. The source language's files are imported; * matches within a folder and ** across folders.",
    id: "jP0KlytPO/",
    description: "Help text under the language file paths field in the project Sync panel",
  },
  errorPathTemplateRequired: {
    defaultMessage: "Say where each language's files are, for example {example}.",
    id: "t1rHIpUc1L",
    description: "Error shown when GitLab sync settings are saved without language file paths",
  },
  errorPathTemplateInvalid: {
    defaultMessage:
      "Put {placeholder} where the language code goes. Use ** only as a whole folder, at most twice, and no more than two * or {placeholder} in one name or eight in all.",
    id: "rIj4p1pD6H",
    description: "Error shown when the language file paths of a project sync can't be used",
  },
  errorGitLabNotConnected: {
    defaultMessage: "Connect GitLab in Integrations first.",
    id: "gNGTIO7J5R",
    description:
      "Error shown when a GitLab project sync is saved while the workspace has no GitLab connection",
  },
  errorGitLabTokenUnreadable: {
    defaultMessage:
      "The workspace's saved GitLab token can't be read. Save the connection again in Integrations.",
    id: "IRQWT9S62n",
    description: "Error shown when the workspace's stored GitLab token can't be decrypted",
  },
  errorGitLabProjectNotFound: {
    defaultMessage: "The workspace's GitLab token can't see this repository. Choose it again.",
    id: "jItb0aNazj",
    description: "Error shown when the GitLab repository chosen for the project sync is not found",
  },
  errorGitLabUnavailable: {
    defaultMessage:
      "GitLab couldn't be reached. Try again or check the connection in Integrations.",
    id: "vLmy8LFeIy",
    description: "Error shown when GitLab can't be reached while saving the project sync",
  },
  runUnmatched: {
    defaultMessage:
      "{unmatched, plural, one {# file} other {# files}} in the folder didn't match the language file paths",
    id: "dIAjQ/dX+w",
    description:
      "Summary of the repository files a project sync run left out because their path matched no language",
  },
  runHiddenKeys: {
    defaultMessage:
      "{count, plural, one {# key was} other {# keys were}} hidden because the repository no longer has them",
    id: "Bs57lrRswl",
    description:
      "Summary of the keys a project sync run hid because they were removed from the repository files",
  },
  runHiddenKeysMore: {
    defaultMessage: "and {more, number} more",
    id: "RJLxYJk50b",
    description: "Follows a shortened list of hidden keys in a project sync run",
  },
});
