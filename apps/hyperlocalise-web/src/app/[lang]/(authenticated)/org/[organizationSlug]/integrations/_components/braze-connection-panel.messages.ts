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

export const brazeConnectionPanelMessages = defineMessages({
  clusterLabel: {
    defaultMessage: "REST cluster",
    id: "IyYEob9ejo",
    description: "Label for the Braze REST cluster picker",
  },
  clusterHint: {
    defaultMessage:
      "Copy the REST endpoint from Braze Settings → APIs and Identifiers. The API key needs campaigns, Canvas, Content Blocks, email, and templates.",
    id: "S4TcthP9rl",
    description:
      "Hint describing where to find the Braze REST cluster and required key permissions",
  },
  saveCluster: {
    defaultMessage: "Save cluster",
    id: "wrS4bTEpmC",
    description: "Button to save the selected Braze REST cluster",
  },
  savingCluster: {
    defaultMessage: "Saving…",
    id: "a1Wl78eFss",
    description: "Button label while the Braze REST cluster is being saved",
  },
  savedToast: {
    defaultMessage: "Braze REST cluster saved.",
    id: "5hI3oH45Sm",
    description: "Toast after the Braze REST cluster is saved",
  },
  saveFailed: {
    defaultMessage: "Failed to save the Braze REST cluster.",
    id: "mQC2dLbQGO",
    description: "Error when the Braze REST cluster cannot be saved",
  },
  loadFailed: {
    defaultMessage: "Failed to load the Braze REST cluster.",
    id: "hzrUUPWRn2",
    description: "Error when the Braze REST cluster cannot be loaded",
  },
  connectKeyFirst: {
    defaultMessage: "Connect a Braze API key, then choose the REST cluster for that instance.",
    id: "2EzZ+CChlm",
    description: "Hint shown before a Braze Pipes key is connected",
  },
});
