"use client";

import { defineMessages } from "react-intl";

export const nativeJobDetailContentMessages = defineMessages({
  failedToLoadJob: {
    defaultMessage: "Failed to load job ({status})",
    id: "VCIZRHU93Q",
    description: "Error when the native job detail request fails",
  },
  jobWrongProject: {
    defaultMessage: "Job does not belong to this project",
    id: "w1oESvG6DH",
    description: "Error when a loaded job belongs to a different project",
  },
  failedToRetryJob: {
    defaultMessage: "Failed to retry job",
    id: "ucza3Qc9pI",
    description: "Toast and error fallback when retrying a job fails",
  },
  jobQueuedForRetry: {
    defaultMessage: "Job queued for retry",
    id: "0Qa7RnRI7o",
    description: "Success toast after queuing a job retry",
  },
  failedToMarkJobFailed: {
    defaultMessage: "Failed to mark job as failed",
    id: "sQRAmiZqfA",
    description: "Toast and error fallback when marking a job failed fails",
  },
  jobMarkedAsFailed: {
    defaultMessage: "Job marked as failed",
    id: "WjVOOBdiGx",
    description: "Success toast after marking a job as failed",
  },
  failedToCancelJob: {
    defaultMessage: "Failed to cancel job",
    id: "fOd0uv4R/b",
    description: "Toast and error fallback when cancelling a job fails",
  },
  jobCancelled: {
    defaultMessage: "Job cancelled",
    id: "Bb2DHr7bXd",
    description: "Success toast after cancelling a job",
  },
  openInProvider: {
    defaultMessage: "Open in {providerKind}",
    id: "onLY1zBVa5",
    description: "Button label to open the job in the external TMS provider",
  },
  retrying: {
    defaultMessage: "Retrying…",
    id: "g++q7Fa3R5",
    description: "Button label while a job retry is in progress",
  },
  retryJob: {
    defaultMessage: "Retry job",
    id: "FMwo8I+LLV",
    description: "Button label to retry a failed or cancelled job",
  },
  cancelJob: {
    defaultMessage: "Cancel job",
    id: "ls6eXbtmYv",
    description: "Button label to open the cancel job confirmation dialog",
  },
  markAsFailed: {
    defaultMessage: "Mark as failed",
    id: "dveuxEzy1E",
    description: "Button label to open the mark-as-failed confirmation dialog",
  },
  viewStrings: {
    defaultMessage: "View strings",
    id: "VwBtOss3uh",
    description: "Button label to open the job CAT workspace",
  },
  markFailedTitle: {
    defaultMessage: "Mark job as failed?",
    id: "hy+niFk4Hc",
    description: "Title of the mark-as-failed confirmation dialog",
  },
  markFailedDescription: {
    defaultMessage:
      "This will stop the job from appearing queued or running and prevent the current workflow run from updating it later.",
    id: "vEvX8KwGFa",
    description: "Description in the mark-as-failed confirmation dialog",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "djWAPr32N4",
    description: "Dismiss button in the mark-as-failed confirmation dialog",
  },
  marking: {
    defaultMessage: "Marking…",
    id: "r90dkDmgjO",
    description: "Confirm button label while marking a job as failed",
  },
  markFailedConfirm: {
    defaultMessage: "Mark failed",
    id: "kiUN7wuEU1",
    description: "Confirm button to mark a job as failed",
  },
  cancelJobTitle: {
    defaultMessage: "Cancel this job?",
    id: "y4bTNRxrtq",
    description: "Title of the cancel job confirmation dialog",
  },
  cancelJobDescription: {
    defaultMessage:
      "The job will move to cancelled and stop running. You can create a new job if you need the work again.",
    id: "cZBJLZRh+f",
    description: "Description in the cancel job confirmation dialog",
  },
  keepJob: {
    defaultMessage: "Keep job",
    id: "+sh3FsSzlz",
    description: "Dismiss button in the cancel job confirmation dialog",
  },
  cancelling: {
    defaultMessage: "Cancelling…",
    id: "h1D+z3ez58",
    description: "Confirm button label while cancelling a job",
  },
});
