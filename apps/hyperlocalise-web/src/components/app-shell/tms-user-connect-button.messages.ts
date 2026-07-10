"use client";

import { defineMessages } from "react-intl";

export const tmsUserConnectButtonMessages = defineMessages({
  connect: {
    defaultMessage: "Connect {provider}",
    id: "Aa0lbVkG8M",
    description: "Button label to start connecting a TMS user account",
  },
  connecting: {
    defaultMessage: "Connecting...",
    id: "P+9nP38ODj",
    description: "Pending label while a TMS OAuth connection is starting",
  },
  startFailed: {
    defaultMessage: "Failed to start {provider} connection",
    id: "RWrEpStLhj",
    description: "Toast error when starting a TMS OAuth connection fails",
  },
});
