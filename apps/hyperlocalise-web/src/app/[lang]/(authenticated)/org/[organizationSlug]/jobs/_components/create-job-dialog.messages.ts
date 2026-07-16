"use client";

import { defineMessages } from "react-intl";

export const createJobDialogMessages = defineMessages({
  title: {
    defaultMessage: "Create job",
    id: "RQv/LERmVL",
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
    defaultMessage: "Optional notes for translators",
    id: "W87BMcVF5T",
    description: "Placeholder for the optional job description field",
  },
  sourceLocale: {
    defaultMessage: "Source locale: {locale}",
    id: "jvDZaWTAOJ",
    description: "Shows the project source locale in the create job dialog",
  },
  targetLocalesLabel: {
    defaultMessage: "Target locales",
    id: "zedkthWR8N",
    description: "Label for the target locales selection list",
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
    defaultMessage: "{count, plural, one {# file selected} other {# files selected}}",
    id: "pckObbKjS/",
    description: "Count of files selected for the new job",
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
  assigneeHintNative: {
    defaultMessage: "Optional. Native jobs currently support one assignee.",
    id: "+WPReqq8Dt",
    description: "Hint under the native job assignee picker",
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
