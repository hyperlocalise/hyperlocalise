"use client";

import { defineMessages } from "react-intl";

export const promptInputMessages = defineMessages({
  addPhotosOrFiles: {
    id: "MNV3NDchKr",

    defaultMessage: "Add photos or files",
    description: "Menu item label for attaching photos or files to a prompt",
  },
  takeScreenshot: {
    id: "pg1KEuGKDm",

    defaultMessage: "Take screenshot",
    description: "Menu item label for capturing a screenshot attachment",
  },
  noFilesMatchTypes: {
    id: "QDxYX6HLaI",

    defaultMessage: "No files match the accepted types.",
    description: "Error when dropped or selected files do not match accepted MIME types",
  },
  allFilesExceedMaxSize: {
    id: "TdSqSMSpF8",

    defaultMessage: "All files exceed the maximum size.",
    description: "Error when all selected files are larger than the allowed size",
  },
  tooManyFiles: {
    id: "uk+4BpyVBj",

    defaultMessage: "Too many files. Some were not added.",
    description: "Error when the number of files exceeds the maximum allowed",
  },
  uploadFilesAria: {
    id: "hgHlEGxrrX",

    defaultMessage: "Upload files",
    description: "Accessible label for the hidden file upload input",
  },
  placeholder: {
    id: "cjv0VAI0+q",

    defaultMessage: "What would you like to know?",
    description: "Default placeholder for the prompt text input",
  },
  stopAria: {
    id: "eBW5K6494F",

    defaultMessage: "Stop",
    description: "Accessible label for stopping an in-progress generation",
  },
  submitAria: {
    id: "PJ5XoQURG9",

    defaultMessage: "Submit",
    description: "Accessible label for submitting the prompt",
  },
});
