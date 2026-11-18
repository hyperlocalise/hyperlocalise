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

export const jobFailureCodeMessages = defineMessages({
  timedOut: {
    defaultMessage: "Translation took too long and timed out. Retrying usually works.",
    id: "jrugIUKi2v",
    description: "Job failure reason when translation timed out",
  },
  leftoverLocales: {
    defaultMessage: "Some languages didn't finish. This is usually temporary.",
    id: "v1KLmya1dC",
    description: "Job failure reason when some locales were left unfinished",
  },
  sourceFileMissing: {
    defaultMessage: "The source file could not be found. It may have been deleted or moved.",
    id: "qN5vH5cFIw",
    description: "Job failure reason when the source file no longer exists",
  },
  sourceFileUnavailable: {
    defaultMessage: "The source file couldn't be downloaded.",
    id: "ZOQ2tKE1Jn",
    description: "Job failure reason when the source file could not be fetched",
  },
  sourceTextUnavailable: {
    defaultMessage: "The source text couldn't be read from the file.",
    id: "0uY8+g+/P5",
    description: "Job failure reason when no source text could be read",
  },
  sourceFileInvalid: {
    defaultMessage: "The source file couldn't be parsed. Check that it is a supported, valid file.",
    id: "FHInczqkpK",
    description: "Job failure reason when the source file could not be parsed",
  },
  invalidJob: {
    defaultMessage: "This job's settings are invalid, so it couldn't run.",
    id: "hqdHQFXJzw",
    description: "Job failure reason when the job input or type is invalid",
  },
  projectMissing: {
    defaultMessage: "The project for this job no longer exists.",
    id: "6ghouuTHvo",
    description: "Job failure reason when the project was deleted",
  },
  imageFailed: {
    defaultMessage: "The image couldn't be translated.",
    id: "cTr+8INKam",
    description: "Job failure reason when image translation failed",
  },
  creditsExhausted: {
    defaultMessage: "Your workspace is out of AI credits. Add credits, then retry.",
    id: "5yOeakcU5Y",
    description: "Job failure reason when the workspace has no AI credits left",
  },
  aiDisabled: {
    defaultMessage: "AI translation isn't enabled for this workspace.",
    id: "K22gtW3611",
    description: "Job failure reason when AI features are not available",
  },
  aiCheckFailed: {
    defaultMessage: "AI usage couldn't be checked. Retry in a few minutes.",
    id: "GouwKj6LlS",
    description: "Job failure reason when the AI usage check failed",
  },
  editorOnly: {
    defaultMessage: "This file type has to be translated in the editor.",
    id: "4kR6n0D7eD",
    description: "Job failure reason for office files that need manual translation",
  },
  translationFailed: {
    defaultMessage: "The translation model returned an error. Retrying usually works.",
    id: "9ewv+9iYs3",
    description: "Job failure reason when translation failed for an unspecified reason",
  },
  noReason: {
    defaultMessage:
      "No reason was recorded. Retry the job, or contact support if it keeps failing.",
    id: "Y9BFEryYpY",
    description: "Job failure notice text when the failure has no recorded reason",
  },
});
