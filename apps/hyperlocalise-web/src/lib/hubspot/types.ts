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

import type { PipesConnectionStatus } from "@/lib/pipes/types";

export type HubspotPipesConnectionStatus = PipesConnectionStatus;

export type HubspotPipesError =
  | { code: "hubspot_pipes_unavailable"; message: string }
  | { code: "hubspot_not_connected"; message: string }
  | { code: "hubspot_pipes_needs_reauthorization"; message: string }
  | { code: "hubspot_pipes_provider_missing"; message: string }
  | { code: "hubspot_api_key_required"; message: string };

export type HubspotSettingsError =
  | HubspotPipesError
  | { code: "hubspot_credentials_invalid"; message: string }
  | { code: "hubspot_temporarily_unavailable"; message: string };
