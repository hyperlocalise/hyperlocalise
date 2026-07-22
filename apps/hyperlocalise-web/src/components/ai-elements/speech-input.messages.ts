"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
