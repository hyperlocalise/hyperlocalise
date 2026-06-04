import {
  CROWDIN_OAUTH_AUTH_MODE,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  type ExternalTmsProviderKind,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { getCrowdinUserConnection } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import {
  formatTmsUserConnectProviderLabel,
  type TmsUserConnectCta,
  type TmsUserConnectProviderKind,
} from "@/lib/providers/tms-user-connection-shared";

export {
  formatTmsUserConnectProviderLabel,
  isTmsUserConnectionRequiredError,
  tmsUserConnectionRequiredMessage,
} from "@/lib/providers/tms-user-connection-shared";
export type {
  TmsUserConnectCta,
  TmsUserConnectProviderKind,
} from "@/lib/providers/tms-user-connection-shared";

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
