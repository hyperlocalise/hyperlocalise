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

export const contentEditorIngestButtonMessages = defineMessages({
  ingestButton: {
    id: "/YdY1bOwtr",
    defaultMessage: "Ingest",
    description: "Button that queues a workspace automation import run from the Content editor",
  },
  ingestQueued: {
    id: "pmbWIp5jA6",
    defaultMessage: "Ingest queued",
    description: "Toast after an automation ingest run is queued",
  },
  ingestFailed: {
    id: "Kbq8fI6g+r",
    defaultMessage: "Could not queue ingest",
    description: "Toast when queuing an automation ingest run fails",
  },
  chooseAutomationTitle: {
    id: "PozUnU6K5l",
    defaultMessage: "Ingest with automation",
    description: "Title of the dialog for choosing which automation to ingest",
  },
  chooseAutomationDescription: {
    id: "qA+TFNS+X9",
    defaultMessage: "Choose which automation should import its configured set now.",
    description: "Description of the ingest automation picker",
  },
  cancel: {
    id: "mGMSi/xA03",
    defaultMessage: "Cancel",
    description: "Cancel the ingest automation picker",
  },
});
