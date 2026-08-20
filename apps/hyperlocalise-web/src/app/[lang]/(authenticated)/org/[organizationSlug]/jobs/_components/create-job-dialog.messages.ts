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

export const createJobDialogMessages = defineMessages({
  title: {
    defaultMessage: "New job",
    id: "yRg4x8kKbX",
    description: "Create job dialog title",
  },
  descriptionProvider: {
    defaultMessage: "Create Crowdin tasks with files, locales, and assignees.",
    id: "nqQ9RngvcW",
    description: "Create job dialog description for Crowdin provider projects",
  },
  descriptionNative: {
    defaultMessage: "Create native translation jobs with files, locales, and an assignee.",
    id: "UASZI6ojDa",
    description: "Create job dialog description for native Hyperlocalise projects",
  },
  titleLabel: {
    defaultMessage: "Title",
    id: "vGwY2igpU6",
    description: "Label for the job title field",
  },
  titlePlaceholder: {
    defaultMessage: "Release notes · JP + KO",
    id: "LKmO3hc5Vz",
    description: "Placeholder for the job title field",
  },
  taskTypeLabel: {
    defaultMessage: "Task type",
    id: "CTLXW62s69",
    description: "Label for the Crowdin task type select",
  },
  taskTypeTranslation: {
    defaultMessage: "Translation",
    id: "2ghn1bUXd2",
    description: "Crowdin task type option for translation",
  },
  taskTypeProofread: {
    defaultMessage: "Proofread",
    id: "39i3huA7AM",
    description: "Crowdin task type option for proofread",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "evmQYH9X0j",
    description: "Label for the optional job description field",
  },
  descriptionPlaceholder: {
    defaultMessage: "Add context for translators…",
    id: "Ml4FXbhH7X",
    description: "Placeholder for the optional job description field",
  },
  targetLocalesLabel: {
    defaultMessage: "Target locales",
    id: "zedkthWR8N",
    description: "Label for the target locales selection list",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "mFzR+186UW",
    description: "Chip label when every target locale is selected",
  },
  localeCount: {
    defaultMessage: "{count, plural, one {# locale} other {# locales}}",
    id: "FjJpQAXPiH",
    description: "Chip label for a partial target locale selection",
  },
  localesPlaceholder: {
    defaultMessage: "Locales",
    id: "iVnVwwFFdq",
    description: "Chip placeholder when no target locales are selected",
  },
  searchLocales: {
    defaultMessage: "Search locales…",
    id: "AKyH88ZuDN",
    description: "Search placeholder in the target locale picker",
  },
  selectAll: {
    defaultMessage: "Select all",
    id: "rGfiaZLTZ0",
    description: "Button to select all target locales",
  },
  clear: {
    defaultMessage: "Clear",
    id: "mAyP67aqS8",
    description: "Button to clear all selected target locales",
  },
  noTargetLocalesConfigured: {
    defaultMessage: "Add target locales in project settings before creating jobs.",
    id: "Ho5CjjaEBq",
    description: "Hint when the project has no target locales configured",
  },
  noLocalesAvailable: {
    defaultMessage: "No locales available",
    id: "Lzjyu+8nDt",
    description: "Empty state when the locale selection list has no items",
  },
  filesLabel: {
    defaultMessage: "Files",
    id: "1ToGNDd6TO",
    description: "Label for the files selection list",
  },
  filesSelectedCount: {
    defaultMessage: "{count, plural, one {# file} other {# files}}",
    id: "e/0aPM+6Iw",
    description: "Count of files selected for the new job",
  },
  searchFiles: {
    defaultMessage: "Search files…",
    id: "hZtUjyTrTe",
    description: "Search placeholder in the files picker",
  },
  filesSearchEmpty: {
    defaultMessage: "No files match this search.",
    id: "q0vQCpRAVI",
    description: "Empty state when the create job file tree search has no matches",
  },
  expandFolder: {
    defaultMessage: "Expand {folder}",
    id: "lwgrrpA8Lf",
    description: "Accessible label to expand a folder in the create job file tree",
  },
  collapseFolder: {
    defaultMessage: "Collapse {folder}",
    id: "b7iFjKUEa6",
    description: "Accessible label to collapse a folder in the create job file tree",
  },
  selectFolder: {
    defaultMessage: "Select all files in {folder}",
    id: "8HnJuAO7Ry",
    description: "Accessible label to select every file in a folder",
  },
  noFilesAvailable: {
    defaultMessage: "No files available in this project.",
    id: "izy21loiHb",
    description: "Empty state when the project has no selectable files",
  },
  assigneesLabel: {
    defaultMessage: "Assignees",
    id: "0A/FtMSjnF",
    description: "Label for multi-assignee selection on Crowdin jobs",
  },
  assigneeLabel: {
    defaultMessage: "Assignee",
    id: "2VWwjqjclF",
    description: "Label for single-assignee selection on native jobs",
  },
  unassigned: {
    defaultMessage: "Unassigned",
    id: "vuk3bDm+PN",
    description: "Chip and picker label when no assignee is selected",
  },
  assigneeCount: {
    defaultMessage: "{count, plural, one {# assignee} other {# assignees}}",
    id: "hTvi2pxcky",
    description: "Chip label for a multi-assignee selection",
  },
  searchAssignees: {
    defaultMessage: "Search people…",
    id: "AlWYFrRq+B",
    description: "Search placeholder in the assignee picker",
  },
  noCrowdinMembers: {
    defaultMessage: "No Crowdin project members found.",
    id: "Qao/O64dbg",
    description: "Empty state when Crowdin project members cannot be listed",
  },
  noOrgMembers: {
    defaultMessage: "No organization members available.",
    id: "vvT35LUoRE",
    description: "Empty state when organization members cannot be listed",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "iD0GLTqlIQ",
    description: "Loading label inside create job property pickers",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "1eCICarqN0",
    description: "Cancel button in the create job dialog footer",
  },
  submit: {
    defaultMessage: "Create job",
    id: "dTKdfkqH71",
    description: "Submit button in the create job dialog footer",
  },
  titleRequired: {
    defaultMessage: "Enter a job title.",
    id: "Kx/HoZ+1yJ",
    description: "Validation error when creating a job without a title",
  },
  localesRequired: {
    defaultMessage: "Select at least one target locale.",
    id: "YQqA4dnF4n",
    description: "Validation error when creating a job without target locales",
  },
  filesRequired: {
    defaultMessage: "Select at least one file.",
    id: "Th3qMjLdD4",
    description: "Validation error when creating a job without files",
  },
  createCrowdinFailed: {
    defaultMessage: "Failed to create Crowdin jobs",
    id: "OJm01EvxZW",
    description: "Fallback error when Crowdin job creation fails without a server message",
  },
  createNativeFailed: {
    defaultMessage: "Failed to create translation job",
    id: "7qHTh1/iSP",
    description: "Fallback error when a native translation job fails to create",
  },
  partialCreateNative: {
    defaultMessage: "Created {createdCount} of {totalCount} jobs, then failed: {errorMessage}",
    id: "vjXHRG767Q",
    description: "Error after some native jobs were created before a later failure",
  },
  noSupportedFiles: {
    defaultMessage: "No supported files were selected.",
    id: "TDQxQUihFM",
    description: "Validation error when selected files are not supported for translation",
  },
  createSuccessOne: {
    defaultMessage: "Job created",
    id: "US//RTOcgM",
    description: "Toast when a single job is created successfully",
  },
  createSuccessMany: {
    defaultMessage: "{count} jobs created",
    id: "8L0EFFuXJa",
    description: "Toast when multiple jobs are created successfully",
  },
  partialCreateWarning: {
    defaultMessage:
      "{count, plural, one {# job} other {# jobs}} created before the error. Refresh the jobs list before retrying to avoid duplicates.",
    id: "In9Z4CgwLT",
    description: "Warning toast when some jobs were created before an error",
  },
  createFailedFallback: {
    defaultMessage: "Failed to create job",
    id: "mF3XaS/Oxa",
    description: "Fallback toast when job creation fails without an error message",
  },
  loadFilesFailed: {
    defaultMessage: "Failed to load files",
    id: "7OFNvD/Tg3",
    description: "Fallback error when native project files fail to load",
  },
  loadProviderFilesFailed: {
    defaultMessage: "Failed to load provider files",
    id: "Wtnws5pYza",
    description: "Fallback error when provider project files fail to load",
  },
  loadMembersFailed: {
    defaultMessage: "Failed to load members",
    id: "t7l1acivlq",
    description: "Fallback error when organization members fail to load",
  },
  loadProjectMembersFailed: {
    defaultMessage: "Failed to load project members",
    id: "/+sp7OInTO",
    description: "Fallback error when Crowdin project members fail to load",
  },
});
