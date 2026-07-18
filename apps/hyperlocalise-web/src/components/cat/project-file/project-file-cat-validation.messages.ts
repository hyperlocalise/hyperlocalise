"use client";

import { defineMessages } from "react-intl";

export const projectFileCatValidationMessages = defineMessages({
  requestFailed: {
    defaultMessage: "Segment validation request failed.",
    id: "76aHgfoqyy",
    description: "Error when the CAT segment validation network request fails",
  },
  invalidJson: {
    defaultMessage: "Segment validation returned invalid JSON.",
    id: "u2Jgj/8hB5",
    description: "Error when the CAT segment validation response body is not valid JSON",
  },
  invalidResponse: {
    defaultMessage: "Segment validation returned an invalid response.",
    id: "zhUOSqs0dW",
    description: "Error when the CAT segment validation response fails schema validation",
  },
});
