"use client";

import { defineMessages } from "react-intl";

export const speechInputMessages = defineMessages({
  startListeningAria: {
    id: "zMIxOiX2UP",
    defaultMessage: "Start listening",
    description: "Accessible label for the speech input button when idle",
  },
  stopListeningAria: {
    id: "EbEk2WHyNY",
    defaultMessage: "Stop listening",
    description: "Accessible label for the speech input button while recording",
  },
  processingAria: {
    id: "7HFUiy2BCU",
    defaultMessage: "Processing speech",
    description: "Accessible label for the speech input button while transcribing audio",
  },
});
