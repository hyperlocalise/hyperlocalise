import {
  CROWDIN_OAUTH_AUTH_MODE,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  type ExternalTmsProviderKind,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { getCrowdinUserConnection } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import { isApiResponseErrorCode } from "@/lib/api-error";

/** Providers that require a per-user OAuth link in addition to the org integration. */
export type TmsUserConnectProviderKind = "crowdin";

export type TmsUserConnectCta =
  | { showConnectCta: false }
  | {
      showConnectCta: true;
      providerKind: TmsUserConnectProviderKind;
      providerDisplayName: string;
    };

const DEFAULT_PROVIDER_LABELS: Record<TmsUserConnectProviderKind, string> = {
  crowdin: "Crowdin",
};

export function formatTmsUserConnectProviderLabel(providerKind: TmsUserConnectProviderKind) {
  return DEFAULT_PROVIDER_LABELS[providerKind];
}

export function tmsUserConnectionRequiredMessage(
  providerKind: TmsUserConnectProviderKind,
  resource: "projects" | "jobs" | "files",
) {
  const label = formatTmsUserConnectProviderLabel(providerKind);
  return `Connect ${label} to view provider ${resource}.`;
}

/** API error codes that mean the active TMS needs a per-user account link. */
export function isTmsUserConnectionRequiredError(error: unknown) {
  return isApiResponseErrorCode(error, "crowdin_user_connection_required");
}

async function resolveCrowdinUserConnectCta(input: {
  organizationId: string;
  userId: string;
  displayName: string;
}): Promise<TmsUserConnectCta> {
  const connection = await getCrowdinUserConnection({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (connection) {
    return { showConnectCta: false };
  }

  return {
    showConnectCta: true,
    providerKind: "crowdin",
    providerDisplayName: input.displayName,
  };
}

/**
 * Whether the signed-in user should link a personal account for the org's active TMS.
 * Based on the active integration only — not a hardcoded Crowdin assumption.
 */
export async function getTmsUserConnectCtaState(input: {
  organizationId: string;
  userId: string;
}): Promise<TmsUserConnectCta> {
  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
    input.organizationId,
  );
  if (!credential) {
    return { showConnectCta: false };
  }

  const providerKind = credential.providerKind as ExternalTmsProviderKind;
  const displayName =
    credential.displayName.trim() ||
    formatTmsUserConnectProviderLabel(providerKind as TmsUserConnectProviderKind);

  if (providerKind === "crowdin" && credential.authMode === CROWDIN_OAUTH_AUTH_MODE) {
    return resolveCrowdinUserConnectCta({
      organizationId: input.organizationId,
      userId: input.userId,
      displayName,
    });
  }

  return { showConnectCta: false };
}
