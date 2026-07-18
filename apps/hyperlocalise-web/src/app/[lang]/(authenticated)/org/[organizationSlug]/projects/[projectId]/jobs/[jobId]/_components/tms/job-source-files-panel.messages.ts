"use client";

import { defineMessages } from "react-intl";

export const jobSourceFilesPanelMessages = defineMessages({
  noTargetLocaleForTaskFile: {
    defaultMessage: "No target locale is available for this task file.",
    id: "6euABf86mn",
    description: "Error when opening CAT without a target locale for a task file",
  },
  fileCantOpenInCat: {
    defaultMessage: "This file can’t be opened in the CAT workspace.",
    id: "1Ax42ak5yi",
    description: "Error when a selected source file cannot be opened in CAT",
  },
  defaultEmptyMessage: {
    defaultMessage: "No source files linked to this job.",
    id: "Jea+rLOA7K",
    description: "Default empty state when a job has no source files",
  },
  sourceFilesHeading: {
    defaultMessage: "Source files",
    id: "EReC/afPt5",
    description: "Heading for the job source files panel",
  },
  unableToLoadSourceFiles: {
    defaultMessage: "Unable to load source files.",
    id: "1+8q1G++3Q",
    description: "Fallback error when source files fail to load",
  },
  catWorkspaceHintWithLocale: {
    defaultMessage:
      "Double-click a file or use View strings to open the CAT workspace for {targetLocale}.",
    id: "JaX2Kyy6KI",
    description: "Hint explaining how to open CAT for the selected file and locale",
  },
  viewStrings: {
    defaultMessage: "View strings",
    id: "VKDvjxl+TJ",
    description: "Button to open the selected source file in the CAT workspace",
  },
  jobSourceFilesAriaLabel: {
    defaultMessage: "Job source files",
    id: "uHYVTMAjs/",
    description: "Accessible label for the job source files tree",
  },
});
