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

export const localisationAuditResultRouteErrorMessages = defineMessages({
  title: {
    defaultMessage: "We couldn't load this audit",
    id: "LYrw2fhqau",
    description: "Heading shown when a localisation audit detail route fails",
  },
  description: {
    defaultMessage: "Try loading the report again, or start a new localisation audit.",
    id: "ybysXlWsw7",
    description: "Guidance shown when a localisation audit detail route fails",
  },
  backToAudits: {
    defaultMessage: "Back to localisation audit",
    id: "27t7ZaoeVg",
    description: "Link from a failed localisation audit detail route to the audit landing page",
  },
});
