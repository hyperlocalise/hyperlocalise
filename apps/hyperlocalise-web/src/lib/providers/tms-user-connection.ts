import {
  OAUTH_AUTH_MODE,
  getActiveOrganizationExternalTmsProviderCredentialRow,
  type ExternalTmsProviderKind,
} from "@/lib/providers/organization-external-tms-provider-credentials";
import { getCrowdinUserConnection } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import { getLokaliseUserConnection } from "@/lib/providers/adapters/lokalise/lokalise-user-connections";
import { getPhraseUserConnection } from "@/lib/providers/adapters/phrase/phrase-user-connections";
import {
  formatTmsUserConnectProviderLabel,
  type TmsUserConnectCta,
  type TmsUserConnectProviderKind,
} from "@/lib/providers/tms-user-connection-shared";
import { createLogger } from "@/lib/log";

const logger = createLogger("tms-user-connection");

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
  };
}

async function resolveLokaliseUserConnectCta(input: {
  organizationId: string;
  userId: string;
  displayName: string;
}): Promise<TmsUserConnectCta> {
  const connection = await getLokaliseUserConnection({
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

  if (providerKind === "crowdin" && credential.authMode === OAUTH_AUTH_MODE) {
    logger.info(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        providerCredentialId: credential.id,
      },
      "tms user connect cta checking crowdin connection",
    );
    return resolveCrowdinUserConnectCta({
      organizationId: input.organizationId,
      userId: input.userId,
      displayName,
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
