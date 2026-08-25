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
import { Hono } from "hono";

import {
  createAuthRoutes,
  createOrgAgentsRoutes,
  createOrgInboxRoutes,
  createOrgIntegrationsRoutes,
  createOrgKnowledgeRoutes,
  createOrgProjectsRoutes,
  createOrgTmsRoutes,
  createOrgWorkspaceRoutes,
  createPublicApiRoutes,
  type OrgScopedRouteOptions,
  type PublicApiRouteOptions,
} from "./route-groups";

/**
 * Type-only Hono apps for `hc<>`. Each group stays small enough for TypeScript
 * to instantiate. Runtime serving still uses the single app in `app.ts`.
 *
 * Browser code must `import type` these aliases. Do not value-import this
 * module from client components — the factories pull in server route modules.
 */
const rpcOrgRouteOptions = {} as OrgScopedRouteOptions;
const rpcPublicApiRouteOptions = {} as PublicApiRouteOptions;

function createAuthRpcApp() {
  return new Hono().basePath("/api").route("/auth", createAuthRoutes());
}

function createV1RpcApp() {
  return new Hono().basePath("/api").route("/v1", createPublicApiRoutes(rpcPublicApiRouteOptions));
}

function createOrgInboxRpcApp() {
  return new Hono()
    .basePath("/api")
    .route("/orgs/:organizationSlug", createOrgInboxRoutes(rpcOrgRouteOptions));
}

function createOrgKnowledgeRpcApp() {
  return new Hono().basePath("/api").route("/orgs/:organizationSlug", createOrgKnowledgeRoutes());
}

function createOrgProjectsRpcApp() {
  return new Hono()
    .basePath("/api")
    .route("/orgs/:organizationSlug", createOrgProjectsRoutes(rpcOrgRouteOptions));
}

function createOrgTmsRpcApp() {
  return new Hono()
    .basePath("/api")
    .route("/orgs/:organizationSlug", createOrgTmsRoutes(rpcOrgRouteOptions));
}

function createOrgIntegrationsRpcApp() {
  return new Hono()
    .basePath("/api")
    .route("/orgs/:organizationSlug", createOrgIntegrationsRoutes());
}

function createOrgAgentsRpcApp() {
  return new Hono().basePath("/api").route("/orgs/:organizationSlug", createOrgAgentsRoutes());
}

function createOrgWorkspaceRpcApp() {
  return new Hono().basePath("/api").route("/orgs/:organizationSlug", createOrgWorkspaceRoutes());
}

export type AuthRpcAppType = ReturnType<typeof createAuthRpcApp>;
export type V1RpcAppType = ReturnType<typeof createV1RpcApp>;
export type OrgInboxRpcAppType = ReturnType<typeof createOrgInboxRpcApp>;
export type OrgKnowledgeRpcAppType = ReturnType<typeof createOrgKnowledgeRpcApp>;
export type OrgProjectsRpcAppType = ReturnType<typeof createOrgProjectsRpcApp>;
export type OrgTmsRpcAppType = ReturnType<typeof createOrgTmsRpcApp>;
export type OrgIntegrationsRpcAppType = ReturnType<typeof createOrgIntegrationsRpcApp>;
export type OrgAgentsRpcAppType = ReturnType<typeof createOrgAgentsRpcApp>;
export type OrgWorkspaceRpcAppType = ReturnType<typeof createOrgWorkspaceRpcApp>;
