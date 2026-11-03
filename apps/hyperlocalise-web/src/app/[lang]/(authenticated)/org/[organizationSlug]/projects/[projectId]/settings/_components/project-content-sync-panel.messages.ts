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
      "Bring source files in from a repository and send finished translations back as a pull request.",
    id: "1BNPaIQzGU",
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
    defaultMessage: "Connect a GitHub repository in Integrations to sync this project.",
    id: "8Fi7Cx7vnM",
    description:
      "Shown in the project Sync panel when the workspace has no enabled GitHub repositories",
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
      "{written, plural, =0 {No translations to send} one {# translated file sent} other {# translated files sent}}",
    id: "AHUOLfre6+",
    description: "Summary of the translated files a project sync run sent back to the repository",
  },
  openPullRequest: {
    defaultMessage: "Open pull request",
    id: "3V79KDlgh2",
    description: "Link to the pull request a project sync run opened",
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
});
