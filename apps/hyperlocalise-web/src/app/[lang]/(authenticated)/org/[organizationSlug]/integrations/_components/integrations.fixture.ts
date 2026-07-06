import type { LlmProvider } from "@/lib/database/types";
import type { ExternalTmsProviderCredentialListItem } from "@/lib/providers/contracts/external-tms-provider-credential";
import { OAUTH_AUTH_MODE } from "@/lib/providers/contracts/external-tms-provider-credential";
import type { TmsProviderCapabilityAction } from "@/lib/providers/tms-capabilities";

import type { ContentfulConnectionSummary } from "./contentful-connection-panel";

const integrationTimestamp = "2026-06-01T12:00:00.000Z";

function createTmsCredentialFixture(
  input: Pick<ExternalTmsProviderCredentialListItem, "providerKind" | "displayName"> &
    Partial<ExternalTmsProviderCredentialListItem>,
): ExternalTmsProviderCredentialListItem {
  const { providerKind, displayName, ...rest } = input;

  return {
    id: `tms_${providerKind}`,
    providerKind,
    displayName,
    authMode: OAUTH_AUTH_MODE,
    region: null,
    baseUrl: null,
    oauthExpiresAt: "2026-12-01T12:00:00.000Z",
    validationStatus: "valid",
    validationMessage: null,
    lastValidatedAt: integrationTimestamp,
    maskedSecretSuffix: "••••abcd",
    createdAt: integrationTimestamp,
    updatedAt: integrationTimestamp,
    lastSuccessfulSyncAt: integrationTimestamp,
    projectCount: 3,
    capabilities: {} as Record<
      TmsProviderCapabilityAction,
      ExternalTmsProviderCredentialListItem["capabilities"][TmsProviderCapabilityAction]
    >,
    ...rest,
  };
}

export const integrationsOrganizationSlug = "acme";

export const integrationsProviderCredentialFixture = {
  provider: "openai" as LlmProvider,
  defaultModel: "gpt-5.5",
  maskedApiKeySuffix: "••••-key",
  lastValidatedAt: integrationTimestamp,
};

export const integrationsCrowdinCredentialFixture = createTmsCredentialFixture({
  providerKind: "crowdin",
  displayName: "Crowdin Production",
  baseUrl: "https://api.crowdin.com/api/v2",
});

export const integrationsExternalTmsCredentialsFixture: ExternalTmsProviderCredentialListItem[] = [
  integrationsCrowdinCredentialFixture,
];

export const integrationsGitHubInstallationFixture = {
  githubInstallationId: "12345678",
  accountLogin: "acme",
  accountType: "Organization",
  repositoryCount: 2,
  enabledRepositoryCount: 2,
};

export const integrationsGitHubRepositoriesFixture = [
  {
    githubRepositoryId: "101",
    fullName: "acme/website",
    private: false,
    archived: false,
    defaultBranch: "main",
    enabled: true,
  },
  {
    githubRepositoryId: "102",
    fullName: "acme/mobile",
    private: true,
    archived: false,
    defaultBranch: "develop",
    enabled: true,
  },
];

export const integrationsSlackAgentFixture = {
  enabled: true,
  teamId: "T01234567" as string | null,
  teamName: "Acme" as string | null,
};

export const integrationsEmailAgentFixture = {
  enabled: true,
  inboundEmailAddress: "automation@inbound.hyperlocalise.test" as string | null,
};

export const integrationsContentfulConnectionsFixture: ContentfulConnectionSummary[] = [
  {
    id: "contentful_conn_001",
    displayName: "Help center",
    projectId: null,
    spaceId: "space_help_center",
    environmentId: "master",
    sourceLocale: null,
    targetLocales: [],
    contentTypeIds: ["article", "landingPage"],
    validationStatus: "valid",
    validationMessage: null,
    maskedTokenSuffix: "••••wxyz",
    webhook: {
      id: "webhook_001",
      status: "active",
      providerWebhookId: "cf_webhook_001",
      url: "https://app.hyperlocalise.test/api/webhooks/contentful/contentful_conn_001",
      lastDeliveryId: "delivery_001",
      lastDeliveredAt: integrationTimestamp,
      lastError: null,
    },
  },
];
