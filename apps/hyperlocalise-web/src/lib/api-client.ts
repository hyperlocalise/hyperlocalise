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
import { hc } from "hono/client";

import type {
  AuthRpcAppType,
  OrgAgentsRpcAppType,
  OrgInboxRpcAppType,
  OrgIntegrationsRpcAppType,
  OrgKnowledgeRpcAppType,
  OrgProjectsRpcAppType,
  OrgTmsRpcAppType,
  OrgWorkspaceRpcAppType,
  V1RpcAppType,
} from "@/api/rpc-apps";

/**
 * Copy named paths off a Hono RPC proxy. Spreading the proxy itself yields an
 * empty object because the client is a `get`-trap Proxy, not an enumerable map.
 */
function pickClientPaths<T extends object, const K extends readonly (keyof T)[]>(
  client: T,
  keys: K,
): Pick<T, K[number]> {
  const result = {} as Pick<T, K[number]>;
  for (const key of keys) {
    result[key] = client[key];
  }
  return result;
}

function apiOrigin() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function createOrgSlugClient(origin: string) {
  const inbox = hc<OrgInboxRpcAppType>(origin).api.orgs[":organizationSlug"];
  const knowledge = hc<OrgKnowledgeRpcAppType>(origin).api.orgs[":organizationSlug"];
  const projects = hc<OrgProjectsRpcAppType>(origin).api.orgs[":organizationSlug"];
  const tms = hc<OrgTmsRpcAppType>(origin).api.orgs[":organizationSlug"];
  const integrations = hc<OrgIntegrationsRpcAppType>(origin).api.orgs[":organizationSlug"];
  const agents = hc<OrgAgentsRpcAppType>(origin).api.orgs[":organizationSlug"];
  const workspace = hc<OrgWorkspaceRpcAppType>(origin).api.orgs[":organizationSlug"];

  return {
    ...pickClientPaths(inbox, [
      "issues",
      "issue-sheet",
      "notifications",
      "notification-preferences",
      "mentions",
      "conversations",
    ]),
    ...pickClientPaths(knowledge, ["glossaries", "knowledge-memory", "translation-memories"]),
    ...pickClientPaths(projects, ["projects", "jobs", "files", "workspace-files", "automations"]),
    ...pickClientPaths(tms, [
      "external-tms-provider-credential",
      "tms-provider",
      "tms-agent-automation",
      "tms-dashboard-summary",
      "provider-credential",
    ]),
    ...pickClientPaths(integrations, [
      "contentful-connections",
      "mcp-server-connections",
      "linked-domains",
      "semrush-connections",
      "ahrefs-connections",
      "intercom-connections",
      "canva-connections",
    ]),
    ...pickClientPaths(agents, ["agent-email", "agent-slack", "github-installation"]),
    ...pickClientPaths(workspace, ["teams", "members", "workspace", "billing", "api-keys"]),
  };
}

export function createApiClient() {
  const origin = apiOrigin();

  return {
    api: {
      orgs: {
        ":organizationSlug": createOrgSlugClient(origin),
      },
      v1: hc<V1RpcAppType>(origin).api.v1,
      auth: hc<AuthRpcAppType>(origin).api.auth,
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
