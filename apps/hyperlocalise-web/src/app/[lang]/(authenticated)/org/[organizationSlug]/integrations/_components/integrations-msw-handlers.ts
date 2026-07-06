import { delay, http, HttpResponse } from "msw";

import {
  integrationsContentfulConnectionsFixture,
  integrationsCrowdinCredentialFixture,
  integrationsEmailAgentFixture,
  integrationsExternalTmsCredentialsFixture,
  integrationsGitHubInstallationFixture,
  integrationsGitHubRepositoriesFixture,
  integrationsProviderCredentialFixture,
  integrationsSlackAgentFixture,
} from "./integrations.fixture";

type IntegrationsSlackAgentFixture = typeof integrationsSlackAgentFixture;

type IntegrationsEmailAgentFixture = typeof integrationsEmailAgentFixture;

function createIntegrationsGetHandlers({
  providerCredential = integrationsProviderCredentialFixture,
  externalTmsCredentials = integrationsExternalTmsCredentialsFixture,
  activeExternalTmsProviderCredential = integrationsCrowdinCredentialFixture,
  githubInstallation = integrationsGitHubInstallationFixture,
  githubRepositories = integrationsGitHubRepositoriesFixture,
  slackAgent = integrationsSlackAgentFixture,
  emailAgent = integrationsEmailAgentFixture,
  contentfulConnections = integrationsContentfulConnectionsFixture,
}: {
  providerCredential?: typeof integrationsProviderCredentialFixture | null;
  externalTmsCredentials?: typeof integrationsExternalTmsCredentialsFixture;
  activeExternalTmsProviderCredential?: typeof integrationsCrowdinCredentialFixture | null;
  githubInstallation?: typeof integrationsGitHubInstallationFixture | null;
  githubRepositories?: typeof integrationsGitHubRepositoriesFixture;
  slackAgent?: IntegrationsSlackAgentFixture;
  emailAgent?: IntegrationsEmailAgentFixture;
  contentfulConnections?: typeof integrationsContentfulConnectionsFixture;
} = {}) {
  return [
    http.get("/api/orgs/:organizationSlug/provider-credential", () =>
      HttpResponse.json({ providerCredential }),
    ),
    http.get("/api/orgs/:organizationSlug/external-tms-provider-credential", () =>
      HttpResponse.json({
        externalTmsProviderCredentials: externalTmsCredentials,
        activeExternalTmsProviderCredential,
      }),
    ),
    http.get("/api/orgs/:organizationSlug/github-installation", () =>
      HttpResponse.json({ installation: githubInstallation }),
    ),
    http.get("/api/orgs/:organizationSlug/github-installation/repositories", () =>
      HttpResponse.json({ repositories: githubRepositories }),
    ),
    http.get("/api/orgs/:organizationSlug/agent-slack", () => HttpResponse.json({ slackAgent })),
    http.get("/api/orgs/:organizationSlug/agent-email", () => HttpResponse.json({ emailAgent })),
    http.get("/api/orgs/:organizationSlug/contentful-connections", () =>
      HttpResponse.json({ contentfulConnections }),
    ),
  ];
}

export const integrationsConnectedMswHandlers = createIntegrationsGetHandlers();

export const integrationsDisconnectedMswHandlers = createIntegrationsGetHandlers({
  providerCredential: null,
  externalTmsCredentials: [],
  activeExternalTmsProviderCredential: null,
  githubInstallation: null,
  githubRepositories: [],
  slackAgent: {
    enabled: false,
    teamId: null,
    teamName: null,
  },
  emailAgent: {
    enabled: false,
    inboundEmailAddress: null,
  },
  contentfulConnections: [],
});

export const integrationsManagedProviderMswHandlers = createIntegrationsGetHandlers({
  providerCredential: null,
});

export const integrationsLoadingMswHandlers = [
  http.get("/api/orgs/:organizationSlug/provider-credential", async () => {
    await delay("infinite");
    return HttpResponse.json({ providerCredential: null });
  }),
  http.get("/api/orgs/:organizationSlug/external-tms-provider-credential", async () => {
    await delay("infinite");
    return HttpResponse.json({
      externalTmsProviderCredentials: [],
      activeExternalTmsProviderCredential: null,
    });
  }),
  http.get("/api/orgs/:organizationSlug/github-installation", async () => {
    await delay("infinite");
    return HttpResponse.json({ installation: null });
  }),
  http.get("/api/orgs/:organizationSlug/github-installation/repositories", async () => {
    await delay("infinite");
    return HttpResponse.json({ repositories: [] });
  }),
  http.get("/api/orgs/:organizationSlug/agent-slack", async () => {
    await delay("infinite");
    return HttpResponse.json({
      slackAgent: {
        enabled: false,
        teamId: null,
        teamName: null,
      },
    });
  }),
  http.get("/api/orgs/:organizationSlug/agent-email", async () => {
    await delay("infinite");
    return HttpResponse.json({
      emailAgent: {
        enabled: false,
        inboundEmailAddress: null,
      },
    });
  }),
  http.get("/api/orgs/:organizationSlug/contentful-connections", async () => {
    await delay("infinite");
    return HttpResponse.json({ contentfulConnections: [] });
  }),
];
