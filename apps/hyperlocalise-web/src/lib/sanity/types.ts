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

export type SanityPipesError = {
  code:
    | "sanity_pipes_unavailable"
    | "sanity_not_connected"
    | "sanity_pipes_needs_reauthorization"
    | "sanity_api_token_required";
  message: string;
};

export type SanityPipesConnectionStatus = {
  connected: boolean;
  needsReauthorization: boolean;
};

export type SanityI18nMode = "document" | "field" | "none";

export type SanityDocumentTypeSummary = {
  name: string;
  i18nMode: SanityI18nMode;
  languages: string[];
};

export type SanityManageProject = {
  id: string;
  displayName: string;
};

export type SanityDatasetSummary = {
  name: string;
};
