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

export type AhrefsConnectionSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  enabled: boolean;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedApiKeySuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type AhrefsConnectionWithApiKey = {
  connection: AhrefsConnectionSummary;
  apiKey: string;
};

export type AhrefsConnectionError =
  | { code: "ahrefs_api_key_required"; message: string }
  | { code: "ahrefs_connection_not_found"; message: string }
  | { code: "ahrefs_connection_decrypt_failed"; message: string }
  | { code: "ahrefs_connection_validation_failed"; message: string }
  | { code: "ahrefs_connection_in_use"; message: string }
  | { code: "ahrefs_mcp_timeout"; message: string };
