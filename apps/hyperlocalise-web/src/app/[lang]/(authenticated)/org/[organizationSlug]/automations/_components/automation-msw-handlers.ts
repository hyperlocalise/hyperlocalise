import { http, HttpResponse } from "msw";

import {
  automationEditorContentfulConnectionsFixture,
  automationEditorProjectsFixture,
  automationEditorRepositoriesFixture,
  automationEditorSlackChannelsFixture,
} from "./automation-editor.fixture";

export const automationEditorMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects", () =>
    HttpResponse.json({ projects: automationEditorProjectsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation", () =>
    HttpResponse.json({
      installation: {
        githubInstallationId: "12345678",
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation/repositories", () =>
    HttpResponse.json({ repositories: automationEditorRepositoriesFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack", () =>
    HttpResponse.json({
      slackAgent: {
        enabled: true,
        teamId: "T01234567",
        teamName: "Acme",
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack/channels", () =>
    HttpResponse.json({ channels: automationEditorSlackChannelsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-email", () =>
    HttpResponse.json({
      emailAgent: {
        enabled: true,
        inboundEmailAddress: "automation@inbound.hyperlocalise.test",
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/contentful-connections", () =>
    HttpResponse.json({ contentfulConnections: automationEditorContentfulConnectionsFixture }),
  ),
];

export const automationEditorDisconnectedMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects", () =>
    HttpResponse.json({ projects: automationEditorProjectsFixture }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation", () =>
    HttpResponse.json({ installation: null }),
  ),
  http.get("/api/orgs/:organizationSlug/github-installation/repositories", () =>
    HttpResponse.json({ repositories: [] }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack", () =>
    HttpResponse.json({
      slackAgent: {
        enabled: false,
        teamId: null,
        teamName: null,
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-slack/channels", () =>
    HttpResponse.json({ channels: [] }),
  ),
  http.get("/api/orgs/:organizationSlug/agent-email", () =>
    HttpResponse.json({
      emailAgent: {
        enabled: false,
        inboundEmailAddress: null,
      },
    }),
  ),
  http.get("/api/orgs/:organizationSlug/contentful-connections", () =>
    HttpResponse.json({ contentfulConnections: [] }),
  ),
];
