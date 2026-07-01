import type {
  TmsProviderCapability,
  TmsProviderCapabilityAction,
} from "@/lib/providers/tms-capabilities";

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
