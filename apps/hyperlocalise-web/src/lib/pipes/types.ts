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
import type { PipesProviderSlug } from "./providers";

export type PipesConnectionStatus = {
  connected: boolean;
  needsReauthorization: boolean;
  apiKeyLast4: string | null;
};

export type PipesStatus = PipesConnectionStatus & {
  provider: PipesProviderSlug;
};

export type PipesStatusError = {
  code: "pipes_unavailable";
  message: string;
};

export type PipesCredentialError =
  | PipesStatusError
  | { code: "pipes_not_connected"; message: string }
  | { code: "pipes_needs_reauthorization"; message: string };
