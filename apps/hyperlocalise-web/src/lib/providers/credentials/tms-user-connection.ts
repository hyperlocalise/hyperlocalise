import {
  crowdinUsesPerUserAuth,
  OAUTH_AUTH_MODE,
  PAT_AUTH_MODE,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  type ExternalTmsProviderKind,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import { lokaliseAuth } from "@/lib/providers/adapters/lokalise/lokalise-auth";
import { getPhraseUserConnection } from "@/lib/providers/adapters/phrase/phrase-auth";
import {
  formatTmsUserConnectProviderLabel,
  type TmsUserConnectCta,
  type TmsUserConnectProviderKind,
} from "@/lib/providers/credentials/tms-user-connection-shared";
import { createLogger } from "@/lib/log";

const logger = createLogger("tms-user-connection");

export {
  formatTmsUserConnectProviderLabel,
  isTmsUserConnectionRequiredError,
  tmsUserConnectionRequiredMessage,
} from "@/lib/providers/credentials/tms-user-connection-shared";
export type {
  TmsUserConnectCta,
  TmsUserConnectProviderKind,
} from "@/lib/providers/credentials/tms-user-connection-shared";

async function resolveCrowdinUserConnectCta(input: {
  organizationId: string;
  userId: string;
  displayName: string;
  connectMethod: "oauth" | "pat";
}): Promise<TmsUserConnectCta> {
  const connection = await crowdinAuth.getUserConnection({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (connection) {
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        connectionId: connection.id,
      },
      "crowdin user connect cta hidden: connection found",
    );
    return { showConnectCta: false };
  }

  logger.info(
    {
      organizationId: input.organizationId,
      userId: input.userId,
    },
    "crowdin user connect cta shown: connection missing",
  );

  return {
    showConnectCta: true,
    providerKind: "crowdin",
    providerDisplayName: input.displayName,
    connectMethod: input.connectMethod,
  };
}

async function resolvePhraseUserConnectCta(input: {
  organizationId: string;
  userId: string;
  displayName: string;
}): Promise<TmsUserConnectCta> {
  const connection = await getPhraseUserConnection({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (connection) {
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        connectionId: connection.id,
      },
      "phrase user connect cta hidden: connection found",
    );
    return { showConnectCta: false };
  }

  logger.info(
    {
      organizationId: input.organizationId,
      userId: input.userId,
    },
    "phrase user connect cta shown: connection missing",
  );

  return {
    showConnectCta: true,
    providerKind: "phrase",
    providerDisplayName: input.displayName,
    connectMethod: "oauth",
  };
}

async function resolveLokaliseUserConnectCta(input: {
  organizationId: string;
  userId: string;
  displayName: string;
}): Promise<TmsUserConnectCta> {
  const connection = await lokaliseAuth.getUserConnection({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  if (connection) {
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        connectionId: connection.id,
      },
      "lokalise user connect cta hidden: connection found",
    );
    return { showConnectCta: false };
  }

  logger.info(
    {
      organizationId: input.organizationId,
      userId: input.userId,
    },
    "lokalise user connect cta shown: connection missing",
  );

  return {
    showConnectCta: true,
    providerKind: "lokalise",
    providerDisplayName: input.displayName,
    connectMethod: "oauth",
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
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
      },
      "tms user connect cta hidden: no active credential",
    );
    return { showConnectCta: false };
  }

  const providerKind = credential.providerKind as ExternalTmsProviderKind;
  const displayName =
    credential.displayName.trim() ||
    formatTmsUserConnectProviderLabel(providerKind as TmsUserConnectProviderKind);

  if (providerKind === "crowdin" && crowdinUsesPerUserAuth(credential.authMode)) {
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        providerCredentialId: credential.id,
        authMode: credential.authMode,
      },
      "tms user connect cta checking crowdin connection",
    );
    return resolveCrowdinUserConnectCta({
      organizationId: input.organizationId,
      userId: input.userId,
      displayName,
      connectMethod: credential.authMode === PAT_AUTH_MODE ? "pat" : "oauth",
    });
  }

  if (providerKind === "phrase" && credential.authMode === OAUTH_AUTH_MODE) {
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        providerCredentialId: credential.id,
      },
      "tms user connect cta checking phrase connection",
    );
    return resolvePhraseUserConnectCta({
      organizationId: input.organizationId,
      userId: input.userId,
      displayName,
    });
  }

  if (providerKind === "lokalise" && credential.authMode === OAUTH_AUTH_MODE) {
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        providerCredentialId: credential.id,
      },
      "tms user connect cta checking lokalise connection",
    );
    return resolveLokaliseUserConnectCta({
      organizationId: input.organizationId,
      userId: input.userId,
      displayName,
    });
  }

  logger.info(
    {
      organizationId: input.organizationId,
      userId: input.userId,
      providerCredentialId: credential.id,
      providerKind,
      authMode: credential.authMode,
    },
    "tms user connect cta hidden: provider does not require user link",
  );

  return { showConnectCta: false };
}
