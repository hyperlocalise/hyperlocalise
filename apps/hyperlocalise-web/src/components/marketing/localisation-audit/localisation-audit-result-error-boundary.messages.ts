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

export const localisationAuditResultErrorBoundaryMessages = defineMessages({
  reportTitle: {
    defaultMessage: "This report could not be shown",
    id: "KLnCqNe1S/",
    description: "Title when the localisation audit report fails to render",
  },
  reportDescription: {
    defaultMessage: "The rest of the page is still available. Try loading the report again.",
    id: "VtE6l/Wmub",
    description: "Guidance when the localisation audit report fails to render",
  },
  sectionTitle: {
    defaultMessage: "This section could not be shown",
    id: "CfDiZIokkH",
    description: "Title when one localisation audit report section fails to render",
  },
  sectionDescription: {
    defaultMessage: "The rest of the report is still available. Try loading this section again.",
    id: "aIR3vTD8Ln",
    description: "Guidance when one localisation audit report section fails to render",
  },
  retry: {
    defaultMessage: "Try again",
    id: "P/F9NX4KdB",
    description: "Button that retries a failed localisation audit report section",
  },
});
