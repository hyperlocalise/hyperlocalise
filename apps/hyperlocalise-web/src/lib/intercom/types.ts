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

import type { IntercomRestEndpoint } from "./constants";

export type IntercomConnectionSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  restEndpoint: IntercomRestEndpoint;
  enabled: boolean;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedAccessTokenSuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type IntercomConnectionWithAccessToken = {
  connection: IntercomConnectionSummary;
  accessToken: string;
};

export type IntercomConnectionError =
  | { code: "intercom_access_token_required"; message: string }
  | { code: "intercom_rest_endpoint_invalid"; message: string }
  | { code: "intercom_connection_not_found"; message: string }
  | { code: "intercom_connection_decrypt_failed"; message: string }
  | { code: "intercom_connection_validation_failed"; message: string }
  | { code: "intercom_validation_timeout"; message: string }
  | { code: "intercom_region_unresolved"; message: string };

export type IntercomPipesConnectionStatus = {
  connected: boolean;
  needsReauthorization: boolean;
};

export type IntercomPipesError =
  | { code: "intercom_pipes_unavailable"; message: string }
  | { code: "intercom_not_connected"; message: string }
  | { code: "intercom_pipes_needs_reauthorization"; message: string };

export type IntercomArticleSyncStatus = "active" | "archived" | "import_failed" | "push_failed";
