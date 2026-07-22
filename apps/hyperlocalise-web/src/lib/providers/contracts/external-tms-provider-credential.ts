/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type {
  TmsProviderCapability,
  TmsProviderCapabilityAction,
} from "@/lib/providers/capabilities/tms-capabilities";

import type { ExternalTmsProviderKind } from "./external-tms-provider-kind";

export const OAUTH_AUTH_MODE = "oauth";
export const API_TOKEN_AUTH_MODE = "api_token";
/** Per-user personal access tokens; org credential stores base URL only. */
export const PAT_AUTH_MODE = "pat";

export function crowdinUsesPerUserAuth(authMode: string | null | undefined) {
  return authMode === OAUTH_AUTH_MODE || authMode === PAT_AUTH_MODE;
}

export type ExternalTmsProviderCredentialSummary = {
  id: string;
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  authMode: string;
  region: string | null;
  baseUrl: string | null;
  oauthExpiresAt: string | null;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedSecretSuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type ExternalTmsProviderCredentialListItem = ExternalTmsProviderCredentialSummary & {
  lastSuccessfulSyncAt: string | null;
  projectCount: number;
  capabilities: Record<TmsProviderCapabilityAction, TmsProviderCapability>;
};
