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
import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  organizationIssuesQuerySchema,
  type OrganizationIssuesQuery,
} from "@/api/routes/issues/issues.schema";
import {
  organizationIssueService,
  type OrganizationIssueListItem,
} from "@/lib/projects/issue-sheet/organization-issue-service";
import { issueIdSchema } from "@/lib/projects/issue-identifier/project-issue-identifier";
import { z } from "zod";

import { apiAuthContextFromMcpAuth } from "@/api/auth/mcp-access";
import { normalizedGlossaryTermStatusFromStatus } from "@/lib/providers/contracts/glossary-term-status";
import { projectIdSchema } from "@/lib/projects/identity/project-id";
import {
  buildAccessibleProjectsWhere,
  buildProjectLinkedGlossaryWhere,
  canAccessGlossary,
  ownedProjectWhere,
} from "@/api/auth/team-access";
import {
  createAuthorizationCode,
  createMcpAuthorizationRequest,
  createMcpConsentGrant,
  generateMcpToken,
  getMcpTokenExpiry,
  hashMcpToken,
  markAuthorizationCodeUsed,
  mcpBearerAuthMiddleware,
  MCP_AUTH_REQUEST_COOKIE,
  MCP_CONSENT_COOKIE,
  parseAuthorizationCode,
  parseMcpAuthorizationRequest,
  parseMcpConsentGrant,
  resolveAuthoritativeMcpSessionAuth,
  verifyPkceChallenge,
  type McpAuthVariables,
} from "@/api/auth/mcp";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { db, schema } from "@/lib/database/client";
import { env } from "@/lib/env";
import { resolveMcpClientMetadata } from "@/api/auth/mcp-client-metadata";
import { isErr } from "@/lib/primitives/result/results";
import {
  issueSheetCreateIssueBodySchema,
  issueSheetUpdateIssueBodySchema,
} from "@/api/routes/project/issue-sheet.schema";
import {
  IssueSheetService,
  type IssueSheetIssue,
} from "@/lib/projects/issue-sheet/issue-sheet-service";
import { isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
import { loadMcpProjectStatus } from "@/api/routes/mcp/mcp-project-status";

const authorizationQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(2048),
  redirect_uri: z.url().max(2048),
  code_challenge: z.string().min(32).max(128),
  code_challenge_method: z.literal("S256"),
  scope: z.string().max(128).optional().default("mcp"),
  state: z.string().max(128).optional(),
  organizationSlug: z.string().max(128).optional(),
});

const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1).max(8192),
    redirect_uri: z.url().max(2048),
    client_id: z.string().min(1).max(2048),
    code_verifier: z.string().min(43).max(128),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1).max(8192),
    client_id: z.string().min(1).max(2048).optional(),
  }),
]);

const registerClientSchema = z.object({
  client_name: z.string().min(1).max(128).optional(),
  redirect_uris: z.array(z.url().max(2048)).min(1).max(10),
  grant_types: z.array(z.string().max(32)).optional(),
  response_types: z.array(z.string().max(32)).optional(),
  scope: z.string().max(128).optional(),
});

function isAllowedRedirectUri(redirectUri: string): boolean {
  const url = new URL(redirectUri);

  if (url.protocol === "https:") {
    return true;
  }

  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

async function findMcpClient(clientId: string, redirectUri: string) {
  const [registeredClient] = await db
    .select({
      clientId: schema.mcpOAuthClients.clientId,
      clientName: schema.mcpOAuthClients.clientName,
      redirectUris: schema.mcpOAuthClients.redirectUris,
    })
    .from(schema.mcpOAuthClients)
    .where(eq(schema.mcpOAuthClients.clientId, clientId))
    .limit(1);

  if (registeredClient?.redirectUris.includes(redirectUri)) {
    return registeredClient;
  }

  if (!clientId.startsWith("https://")) {
    return null;
  }

  const metadataResult = await resolveMcpClientMetadata({
    clientId,
    redirectUri,
  });

  if (isErr(metadataResult)) {
    return null;
  }

  return metadataResult.value;
}

function endpointOrigin(c: { req: { url: string } }) {
  return new URL(c.req.url).origin;
}

function secureCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

const MAX_MCP_AUTH_REQUEST_COOKIE_VALUE_LENGTH = 3_500;

function storeMcpAuthRequestCookie(c: Parameters<typeof setCookie>[0], token: string): boolean {
  if (token.length > MAX_MCP_AUTH_REQUEST_COOKIE_VALUE_LENGTH) {
    return false;
  }

  setCookie(c, MCP_AUTH_REQUEST_COOKIE, token, secureCookieOptions(15 * 60));

  return true;
}

function storeMcpConsentCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, MCP_CONSENT_COOKIE, token, secureCookieOptions(5 * 60));
}

function clearMcpOAuthCookies(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, MCP_AUTH_REQUEST_COOKIE, { path: "/" });
  deleteCookie(c, MCP_CONSENT_COOKIE, { path: "/" });
}

function buildCallbackUrl(
  apiBasePath: string,
  origin: string,
  query: z.infer<typeof authorizationQuerySchema>,
) {
  const callbackUrl = new URL(`${apiBasePath}/mcp/callback`, origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      callbackUrl.searchParams.set(key, String(value));
    }
  }
  return callbackUrl;
}

function renderMcpConsentPage(input: {
  clientName: string | null;
  redirectUri: string;
  organizationName: string;
  scope: string;
  approveAction: string;
}) {
  const clientLabel = input.clientName?.trim() || "Unnamed MCP client";
  const escaped = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authorize MCP access</title>
  </head>
  <body>
    <main>
      <h1>Authorize MCP access</h1>
      <p><strong>${escaped(clientLabel)}</strong> is requesting access to your Hyperlocalise workspace.</p>
      <ul>
        <li>Organization: ${escaped(input.organizationName)}</li>
        <li>Redirect URI: ${escaped(input.redirectUri)}</li>
        <li>Scope: ${escaped(input.scope)}</li>
      </ul>
      <form method="post" action="${escaped(input.approveAction)}">
        <button type="submit">Allow access</button>
      </form>
      <p><a href="/">Cancel</a></p>
    </main>
  </body>
</html>`;
}

async function issueAuthorizationCodeRedirect(
  c: { redirect: (location: string, status: 302) => Response },
  query: z.infer<typeof authorizationQuerySchema>,
  auth: NonNullable<Awaited<ReturnType<typeof resolveApiAuthContextFromSession>>>,
) {
  const code = createAuthorizationCode({
    clientId: query.client_id,
    redirectUri: query.redirect_uri,
    codeChallenge: query.code_challenge,
    codeChallengeMethod: query.code_challenge_method,
    scope: query.scope,
    state: query.state,
    userId: auth.user.localUserId,
    organizationId: auth.organization.localOrganizationId,
  });

  const redirectUrl = new URL(query.redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (query.state) {
    redirectUrl.searchParams.set("state", query.state);
  }

  return c.redirect(redirectUrl.toString(), 302);
}

function getMcpBasePath(apiBasePath: string) {
  return `${apiBasePath}/mcp`;
}

export function getMcpAuthorizationServerMetadata(origin: string, apiBasePath = "/api") {
  const mcpBasePath = getMcpBasePath(apiBasePath);

  return {
    issuer: origin,
    authorization_endpoint: `${origin}${mcpBasePath}/authorize`,
    token_endpoint: `${origin}${mcpBasePath}/token`,
    ...(env.MCP_ALLOW_DYNAMIC_REGISTRATION
      ? { registration_endpoint: `${origin}${mcpBasePath}/register` }
      : {}),
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: "https://hyperlocalise.com",
    client_id_metadata_document_supported: true,
  };
}

export function getMcpProtectedResourceMetadata(origin: string, apiBasePath = "/api") {
  const mcpBasePath = getMcpBasePath(apiBasePath);

  return {
    resource: `${origin}${mcpBasePath}`,
    authorization_servers: [origin],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  };
}

async function readTokenRequestBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }

  try {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  } catch {
    return {};
  }
}

function tokenResponse(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}) {
  return {
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    token_type: "Bearer",
    expires_in: input.expiresIn,
    scope: input.scope,
  };
}

const mcpAuthEnabledMiddleware = createMiddleware(async (c, next) => {
  if (!env.MCP_AUTH_ENABLED) {
    return c.json({ error: "mcp_auth_disabled" }, 503);
  }

  await next();
});

const invalidIssueQuery = Symbol("invalid_issue_query");
const issueQueryShape = organizationIssuesQuerySchema.shape;

const mcpListIssuesInputSchema = z
  .object({
    view: issueQueryShape.view.catch(invalidIssueQuery as never).meta({ default: undefined }),
    status: issueQueryShape.status.catch(invalidIssueQuery as never).meta({ default: undefined }),
    issueType: issueQueryShape.issueType
      .catch(invalidIssueQuery as never)
      .meta({ default: undefined }),
    priority: issueQueryShape.priority
      .catch(invalidIssueQuery as never)
      .meta({ default: undefined }),
    locale: issueQueryShape.locale.catch(invalidIssueQuery as never).meta({ default: undefined }),
    assignee: issueQueryShape.assignee
      .catch(invalidIssueQuery as never)
      .meta({ default: undefined }),
    projectId: issueQueryShape.projectId
      .catch(invalidIssueQuery as never)
      .meta({ default: undefined }),
    search: issueQueryShape.search.catch(invalidIssueQuery as never).meta({ default: undefined }),
    sort: issueQueryShape.sort.catch(invalidIssueQuery as never).meta({ default: "status" }),
    sortDir: issueQueryShape.sortDir.catch(invalidIssueQuery as never).meta({ default: undefined }),
    limit: issueQueryShape.limit.catch(invalidIssueQuery as never).meta({ default: 50 }),
    offset: issueQueryShape.offset.catch(invalidIssueQuery as never).meta({ default: 0 }),
  })
  .check((context) => {
    if (Object.values(context.value).some((value) => (value as unknown) === invalidIssueQuery)) {
      context.issues.push({
        code: "custom",
        input: context.value,
        message: "invalid_issue_query",
        path: [],
      });
    }
  });

const mcpGetIssueInputSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe("ID of the accessible Hyperlocalise project containing the issue."),
  issueId: issueIdSchema.describe(
    "Canonical issue identifier such as HL-123, or a legacy issue UUID.",
  ),
});

const issueSheetService = new IssueSheetService();
const createIssueShape = issueSheetCreateIssueBodySchema.shape;
const updateIssueShape = issueSheetUpdateIssueBodySchema.shape;
const invalidIssueUpdate = Symbol("invalid_issue_update");

const mcpUpdateIssueInputSchema = z
  .object({
    projectId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .catch(invalidIssueUpdate as never)
      .describe("ID of the accessible Hyperlocalise project containing the issue."),
    issueId: issueIdSchema
      .catch(invalidIssueUpdate as never)
      .describe("Canonical issue identifier such as HL-123, or a legacy issue UUID."),
    title: updateIssueShape.title
      .catch(invalidIssueUpdate as never)
      .describe("Replacement issue title."),
    description: updateIssueShape.description
      .catch(invalidIssueUpdate as never)
      .describe("Replacement issue description."),
    issueType: updateIssueShape.issueType
      .catch(invalidIssueUpdate as never)
      .describe("Replacement issue classification."),
    status: updateIssueShape.status
      .catch(invalidIssueUpdate as never)
      .describe("Replacement issue status."),
    targetLocale: updateIssueShape.targetLocale
      .catch(invalidIssueUpdate as never)
      .describe("Replacement target locale, or null to clear it."),
    sourcePath: updateIssueShape.sourcePath
      .catch(invalidIssueUpdate as never)
      .describe("Replacement source path, or null to clear it."),
    segmentId: updateIssueShape.segmentId
      .catch(invalidIssueUpdate as never)
      .describe("Replacement segment identifier, or null to clear it."),
    translationKeyId: updateIssueShape.translationKeyId
      .catch(invalidIssueUpdate as never)
      .describe("Replacement translation key UUID, or null to clear it."),
    assigneeUserId: updateIssueShape.assigneeUserId
      .catch(invalidIssueUpdate as never)
      .describe("Replacement assignee UUID, or null to unassign."),
    priority: createIssueShape.priority
      .catch(invalidIssueUpdate as never)
      .describe("Replacement priority: P0, P1, or P2."),
  })
  .check((context) => {
    const { projectId: _projectId, issueId: _issueId, ...updates } = context.value;
    const hasInvalidValue = Object.values(context.value).some(
      (value) => (value as unknown) === invalidIssueUpdate,
    );
    const hasUpdate = Object.values(updates).some((value) => value !== undefined);

    if (hasInvalidValue || !hasUpdate) {
      context.issues.push({
        code: "custom",
        input: context.value,
        message: "invalid_issue_update",
        path: [],
      });
    }
  });

const mcpCreateIssueInputSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe("ID of the accessible Hyperlocalise project in which to create the issue."),
  title: createIssueShape.title.describe(
    "Short issue title describing the problem or requested work.",
  ),
  description: createIssueShape.description.describe("Optional detailed issue description."),
  issueType: createIssueShape.issueType.describe(
    "Optional issue classification. Defaults to general_question.",
  ),
  status: createIssueShape.status.describe("Optional initial issue status. Defaults to open."),
  targetLocale: createIssueShape.targetLocale.describe(
    "Optional target locale associated with the issue.",
  ),
  sourcePath: createIssueShape.sourcePath.describe(
    "Optional source file or content path associated with the issue.",
  ),
  segmentId: createIssueShape.segmentId.describe(
    "Optional source segment identifier associated with the issue.",
  ),
  translationKeyId: createIssueShape.translationKeyId.describe(
    "Optional UUID of a translation key in the target project.",
  ),
  assigneeUserId: createIssueShape.assigneeUserId.describe(
    "Optional UUID of an assignable project member.",
  ),
  priority: createIssueShape.priority.describe("Optional issue priority: P0, P1, or P2."),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .optional()
    .describe(
      "Caller-generated retry key. Reusing it with an equivalent payload returns the existing issue.",
    ),
});

type McpCreateIssueInput = z.infer<typeof mcpCreateIssueInputSchema>;

const MCP_CREATE_ISSUE_FINGERPRINT_KEY = "mcpCreateIssueFingerprint";

function mcpCreateIssueFingerprint(
  input: Omit<McpCreateIssueInput, "projectId" | "idempotencyKey">,
) {
  const canonicalPayload = {
    title: input.title,
    description: input.description ?? "",
    issueType: input.issueType ?? "general_question",
    status: input.status ?? "open",
    targetLocale: input.targetLocale ?? null,
    sourcePath: input.sourcePath ?? null,
    segmentId: input.segmentId ?? null,
    translationKeyId: input.translationKeyId ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    priority: input.priority ?? null,
  };

  return createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
}

function mcpToolError(code: string, message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: code, message }),
      },
    ],
    isError: true,
  };
}

function detailedMcpIssue(issue: IssueSheetIssue) {
  const { key, sourceText, ...issueDetails } = issue;

  return {
    ...issueDetails,
    linkedTranslationKey: issue.translationKeyId
      ? {
          id: issue.translationKeyId,
          key,
          sourceText,
        }
      : null,
  };
}

function compactMcpIssue(issue: OrganizationIssueListItem) {
  return {
    id: issue.id,
    identifier: issue.identifier,
    projectId: issue.projectId,
    projectName: issue.projectName,
    title: issue.title,
    description: issue.description.slice(0, 500),
    issueType: issue.issueType,
    status: issue.status,
    priority: issue.priority,
    targetLocale: issue.targetLocale,
    assignee: issue.assignee,
    assigneeUserId: issue.assigneeUserId,
    sourcePath: issue.sourcePath,
    segmentId: issue.segmentId,
    linkKind: issue.linkKind,
    linkLabel: issue.linkLabel,
    linkUrl: issue.linkUrl,
    templateKey: issue.templateKey,
    key: issue.key,
    sourceText: issue.sourceText,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    resolvedAt: issue.resolvedAt,
  };
}

async function createMcpServerForRequest(auth: McpAuthVariables["mcpAuth"]) {
  const apiAuth = apiAuthContextFromMcpAuth(auth);
  const server = new McpServer({
    name: "hyperlocalise",
    version: "0.1.0",
  });

  server.registerTool(
    "list_projects",
    {
      description: "List Hyperlocalise projects for the authenticated organization.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
      }),
    },
    async ({ limit }) => {
      const projects = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          description: schema.projects.description,
          translationContext: schema.projects.translationContext,
          createdAt: schema.projects.createdAt,
          updatedAt: schema.projects.updatedAt,
        })
        .from(schema.projects)
        .where(await buildAccessibleProjectsWhere(apiAuth))
        .orderBy(desc(schema.projects.createdAt))
        .limit(limit);

      return {
        content: [{ type: "text", text: JSON.stringify({ projects }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_project",
    {
      description: "Get Hyperlocalise project details by ID.",
      inputSchema: z.object({
        projectId: projectIdSchema,
      }),
    },
    async ({ projectId }) => {
      const [project] = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          description: schema.projects.description,
          translationContext: schema.projects.translationContext,
          createdAt: schema.projects.createdAt,
          updatedAt: schema.projects.updatedAt,
        })
        .from(schema.projects)
        .where(await ownedProjectWhere(apiAuth, projectId))
        .limit(1);

      return {
        content: [{ type: "text", text: JSON.stringify({ project: project ?? null }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_project_status",
    {
      description:
        "Get locale coverage counts for an accessible Hyperlocalise project. Returns CAT queue totals per target locale without source or target text. Counts use the native key overlay (the same filters as the Content Editor). Live TMS provider statistics are out of scope.",
      inputSchema: z.object({
        projectId: projectIdSchema.describe("ID of the accessible Hyperlocalise project."),
        sourcePath: z
          .string()
          .trim()
          .min(1)
          .max(2048)
          .optional()
          .describe(
            "Optional source file path. When set, also returns counts for that file only.",
          ),
      }),
    },
    async ({ projectId, sourcePath }) => {
      const [project] = await db
        .select({
          id: schema.projects.id,
          sourceLocale: schema.projects.sourceLocale,
          targetLocales: schema.projects.targetLocales,
        })
        .from(schema.projects)
        .where(await ownedProjectWhere(apiAuth, projectId))
        .limit(1);

      if (!project) {
        return mcpToolError("project_not_found", "Project not found or inaccessible");
      }

      const status = await loadMcpProjectStatus({
        organizationId: apiAuth.organization.localOrganizationId,
        projectId: project.id,
        sourceLocale: project.sourceLocale,
        targetLocales: project.targetLocales,
        sourcePath,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_issues",
    {
      description:
        "List issues visible to the authenticated organization with filtering, sorting, and pagination.",
      inputSchema: mcpListIssuesInputSchema,
    },
    async (query: OrganizationIssuesQuery) => {
      const result = await organizationIssueService.list(apiAuth, query);
      const nextOffset = query.offset + result.issues.length;
      const hasMore = nextOffset < result.total;

      const output = {
        total: result.total,
        summary: result.summary,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          hasMore,
          nextOffset: hasMore ? nextOffset : null,
        },
        issues: result.issues.map(compactMcpIssue),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_issue",
    {
      description: "Get the complete details of one accessible Hyperlocalise issue.",
      inputSchema: mcpGetIssueInputSchema,
    },
    async ({ projectId, issueId }) => {
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(await ownedProjectWhere(apiAuth, projectId))
        .limit(1);

      if (!project) {
        return mcpToolError("issue_not_found", "Issue not found");
      }

      const issue = await issueSheetService.getIssue({
        organizationId: apiAuth.organization.localOrganizationId,
        projectId: project.id,
        issueId,
        actorUserId: apiAuth.user.localUserId,
      });

      if (!issue) {
        return mcpToolError("issue_not_found", "Issue not found");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              issue: detailedMcpIssue(issue),
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "update_issue",
    {
      description: "Update mutable fields on one accessible Hyperlocalise issue.",
      inputSchema: mcpUpdateIssueInputSchema,
    },
    async ({ projectId, issueId, priority, ...updates }) => {
      if (!isWriteBackTranslationAllowed(apiAuth.membership.role)) {
        return mcpToolError("forbidden", "Insufficient permissions to update issues");
      }

      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(await ownedProjectWhere(apiAuth, projectId))
        .limit(1);

      if (!project) {
        return mcpToolError("issue_not_found", "Issue not found");
      }

      try {
        const result = await issueSheetService.updateIssue({
          organizationId: apiAuth.organization.localOrganizationId,
          projectId: project.id,
          issueId,
          actorUserId: apiAuth.user.localUserId,
          body: updates,
          priority,
          returnOutcome: true,
        });

        if (!result) {
          return mcpToolError("issue_not_found", "Issue not found");
        }

        if (!("outcome" in result)) {
          throw new Error("expected issue update outcome");
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                outcome: result.outcome,
                issue: detailedMcpIssue(result.issue),
              }),
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "assignee_not_assignable") {
            return mcpToolError(
              "assignee_not_assignable",
              "Assignee is not assignable to this project",
            );
          }

          if (error.message === "translation_key_not_found") {
            return mcpToolError(
              "translation_key_not_found",
              "Translation key was not found in this project",
            );
          }

          if (error.message === "invalid_issue_transition") {
            return mcpToolError(
              "invalid_issue_transition",
              "The requested issue status transition is invalid",
            );
          }

          if (
            error.message === "invalid_issue_sheet_select_value" ||
            error.message === "issue_sheet_column_not_found"
          ) {
            return mcpToolError("invalid_issue_update", "The requested issue update is invalid");
          }
        }

        throw error;
      }
    },
  );

  server.registerTool(
    "create_issue",
    {
      description: "Create one issue in an accessible Hyperlocalise project.",
      inputSchema: mcpCreateIssueInputSchema,
    },
    async ({ projectId, idempotencyKey, ...body }) => {
      if (!isWriteBackTranslationAllowed(apiAuth.membership.role)) {
        return mcpToolError("forbidden", "Insufficient permissions to create issues");
      }

      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(await ownedProjectWhere(apiAuth, projectId))
        .limit(1);

      if (!project) {
        return mcpToolError("project_not_found", "Project not found or inaccessible");
      }

      let issue: Awaited<ReturnType<IssueSheetService["createIssue"]>> | null = null;
      const externalRef = idempotencyKey ? `mcp:${idempotencyKey}` : undefined;
      const fingerprint = idempotencyKey ? mcpCreateIssueFingerprint(body) : undefined;

      if (externalRef && fingerprint) {
        const [existing] = await db
          .select({
            id: schema.issueSheetIssues.id,
            metadata: schema.issueSheetIssues.metadata,
          })
          .from(schema.issueSheetIssues)
          .where(
            and(
              eq(schema.issueSheetIssues.organizationId, apiAuth.organization.localOrganizationId),
              eq(schema.issueSheetIssues.projectId, projectId),
              eq(schema.issueSheetIssues.externalRef, externalRef),
            ),
          )
          .limit(1);

        if (existing) {
          if (existing.metadata[MCP_CREATE_ISSUE_FINGERPRINT_KEY] !== fingerprint) {
            return mcpToolError(
              "issue_already_exists",
              "The idempotency key is already associated with a different issue payload",
            );
          }

          issue = await issueSheetService.getIssue({
            organizationId: apiAuth.organization.localOrganizationId,
            projectId,
            issueId: existing.id,
            actorUserId: apiAuth.user.localUserId,
          });
        }
      }

      if (!issue) {
        try {
          issue = await issueSheetService.createIssue({
            organizationId: apiAuth.organization.localOrganizationId,
            projectId,
            actorUserId: apiAuth.user.localUserId,
            deduplicateLinkedIssues: false,
            ...(fingerprint
              ? { metadata: { [MCP_CREATE_ISSUE_FINGERPRINT_KEY]: fingerprint } }
              : {}),
            body: {
              ...body,
              linkKind: "manual",
              linkLabel: "MCP",
              ...(externalRef ? { externalRef } : {}),
            },
          });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === "assignee_not_assignable") {
              return mcpToolError(
                "assignee_not_assignable",
                "Assignee is not assignable to this project",
              );
            }

            if (error.message === "translation_key_not_found") {
              return mcpToolError(
                "translation_key_not_found",
                "Translation key was not found in this project",
              );
            }

            if (error.message.includes("duplicate")) {
              return mcpToolError(
                "issue_already_exists",
                "An issue already exists for this reference",
              );
            }
          }

          throw error;
        }
      }

      if (!issue) {
        throw new Error("issue_sheet_issue_load_failed");
      }

      if (fingerprint) {
        const [persisted] = await db
          .select({ metadata: schema.issueSheetIssues.metadata })
          .from(schema.issueSheetIssues)
          .where(eq(schema.issueSheetIssues.id, issue.id))
          .limit(1);

        if (persisted && persisted.metadata[MCP_CREATE_ISSUE_FINGERPRINT_KEY] !== fingerprint) {
          return mcpToolError(
            "issue_already_exists",
            "The idempotency key is already associated with a different issue payload",
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: issue.id,
              projectId,
              identifier: issue.identifier,
              title: issue.title,
              description: issue.description,
              issueType: issue.issueType,
              status: issue.status,
              priority: typeof issue.values.priority === "string" ? issue.values.priority : null,
              targetLocale: issue.targetLocale,
              sourcePath: issue.sourcePath,
              segmentId: issue.segmentId,
              translationKeyId: issue.translationKeyId,
              assignee: issue.assignee,
              assigneeUserId: issue.assigneeUserId,
              createdAt: issue.createdAt,
              updatedAt: issue.updatedAt,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_glossaries",
    {
      description: "List glossaries for the authenticated organization.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
      }),
    },
    async ({ limit }) => {
      const glossaries = await db
        .select({
          id: schema.glossaries.id,
          name: schema.glossaries.name,
          description: schema.glossaries.description,
          sourceLocale: schema.glossaries.sourceLocale,
          targetLocale: schema.glossaries.targetLocale,
          status: schema.glossaries.status,
        })
        .from(schema.glossaries)
        .where(await buildProjectLinkedGlossaryWhere(apiAuth))
        .orderBy(desc(schema.glossaries.createdAt))
        .limit(limit);

      return {
        content: [{ type: "text", text: JSON.stringify({ glossaries }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_glossary_entries",
    {
      description: "Get glossary entries for a glossary in the authenticated organization.",
      inputSchema: z.object({
        glossaryId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    },
    async ({ glossaryId, limit }) => {
      const glossary = await canAccessGlossary(apiAuth, glossaryId);

      if (!glossary) {
        return {
          content: [{ type: "text", text: JSON.stringify({ entries: [] }, null, 2) }],
        };
      }

      const rows = await db
        .select({
          id: schema.glossaryTerms.id,
          conceptId: schema.glossaryTerms.conceptId,
          locale: schema.glossaryTerms.locale,
          term: schema.glossaryTerms.term,
          description: schema.glossaryTerms.description,
          partOfSpeech: schema.glossaryTerms.partOfSpeech,
          status: schema.glossaryTerms.status,
          forbidden: schema.glossaryTerms.forbidden,
        })
        .from(schema.glossaryTerms)
        .where(
          and(
            eq(schema.glossaryTerms.glossaryId, glossaryId),
            isNotNull(schema.glossaryTerms.conceptId),
            isNotNull(schema.glossaryTerms.term),
          ),
        )
        .orderBy(schema.glossaryTerms.term)
        .limit(limit);

      const entries = rows.map((row) => ({
        id: row.id,
        conceptId: row.conceptId,
        locale: row.locale,
        term: row.term,
        description: row.description,
        partOfSpeech: row.partOfSpeech,
        status: row.status,
        forbidden: row.forbidden || normalizedGlossaryTermStatusFromStatus(row.status).forbidden,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ entries }, null, 2) }],
      };
    },
  );

  for (const name of [
    "list_translations",
    "upload_sources",
    "download_translations",
    "run_workflow",
  ] as const) {
    server.registerTool(
      name,
      {
        description: `${name} is reserved for the MCP surface and will be wired to the workflow layer next.`,
        inputSchema: z.object({}),
      },
      async () => ({
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "not_implemented", tool: name }, null, 2),
          },
        ],
      }),
    );
  }

  return server;
}

async function handleMcpTransport(request: Request, auth: McpAuthVariables["mcpAuth"]) {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: "POST",
      },
    });
  }

  const server = await createMcpServerForRequest(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

const validateAuthorizationQuery = validator("query", (value, c) => {
  const parsed = authorizationQuerySchema.safeParse(value);

  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  return parsed.data;
});

const validateRegisterBody = validator("json", (value, c) => {
  const parsed = registerClientSchema.safeParse(value);

  if (!parsed.success) {
    return c.json({ error: "invalid_client_metadata" }, 400);
  }

  return parsed.data;
});

export function createMcpRoutes(options: { apiBasePath?: string } = {}) {
  const apiBasePath = options.apiBasePath ?? "/api";

  // `/mcp` is the canonical Streamable HTTP endpoint advertised by
  // protected-resource metadata. `/mcp/sse` and `/mcp/message` remain
  // compatibility aliases.
  return new Hono<{ Variables: McpAuthVariables }>()
    .get("/.well-known/oauth-authorization-server", (c) =>
      c.json(getMcpAuthorizationServerMetadata(endpointOrigin(c), apiBasePath), 200),
    )
    .get("/.well-known/oauth-protected-resource", (c) =>
      c.json(getMcpProtectedResourceMetadata(endpointOrigin(c), apiBasePath), 200),
    )
    .use("/mcp", mcpAuthEnabledMiddleware)
    .use("/mcp/*", mcpAuthEnabledMiddleware)
    .post(
      "/mcp/register",
      bodyLimit({
        maxSize: 256 * 1024, // 256KB
        onError: (c) => c.json({ error: "payload_too_large" }, 413),
      }),
      validateRegisterBody,
      async (c) => {
        if (!env.MCP_ALLOW_DYNAMIC_REGISTRATION) {
          return c.json({ error: "registration_disabled" }, 403);
        }

        const payload = c.req.valid("json");
        const unsupportedRedirectUri = payload.redirect_uris.find(
          (uri) => !isAllowedRedirectUri(uri),
        );

        if (unsupportedRedirectUri) {
          return c.json({ error: "invalid_redirect_uri" }, 400);
        }

        const clientId = `mcp_${randomUUID()}`;
        const grantTypes = ["authorization_code", "refresh_token"];
        const responseTypes = ["code"];
        const scope = payload.scope ?? "mcp";

        await db.insert(schema.mcpOAuthClients).values({
          clientId,
          clientName: payload.client_name,
          redirectUris: payload.redirect_uris,
          grantTypes,
          responseTypes,
          scope,
        });

        return c.json(
          {
            client_id: clientId,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            client_name: payload.client_name,
            redirect_uris: payload.redirect_uris,
            grant_types: grantTypes,
            response_types: responseTypes,
            token_endpoint_auth_method: "none",
            scope,
          },
          201,
        );
      },
    )
    .get("/mcp/authorize", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");

      if (!isAllowedRedirectUri(query.redirect_uri)) {
        return c.json({ error: "invalid_redirect_uri" }, 400);
      }

      const client = await findMcpClient(query.client_id, query.redirect_uri);

      if (!client) {
        return c.json({ error: "invalid_client" }, 400);
      }

      const authRequest = createMcpAuthorizationRequest({
        clientId: query.client_id,
        clientName: client.clientName ?? undefined,
        redirectUri: query.redirect_uri,
        codeChallenge: query.code_challenge,
        codeChallengeMethod: query.code_challenge_method,
        scope: query.scope,
        state: query.state,
        organizationSlug: query.organizationSlug,
      });

      if (!storeMcpAuthRequestCookie(c, authRequest)) {
        return c.json({ error: "invalid_request" }, 400);
      }

      const callbackUrl = buildCallbackUrl(apiBasePath, endpointOrigin(c), query);
      const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
      signInUrl.searchParams.set("returnTo", `${callbackUrl.pathname}${callbackUrl.search}`);

      return c.redirect(signInUrl.toString(), 302);
    })
    .get("/mcp/consent", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");
      const authRequestToken = getCookie(c, MCP_AUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken ? parseMcpAuthorizationRequest(authRequestToken) : null;

      if (
        !authRequest ||
        authRequest.clientId !== query.client_id ||
        authRequest.redirectUri !== query.redirect_uri ||
        authRequest.codeChallenge !== query.code_challenge
      ) {
        return c.json({ error: "invalid_request" }, 400);
      }

      const auth = await resolveApiAuthContextFromSession({
        organizationSlug: query.organizationSlug ?? authRequest.organizationSlug,
      });

      if (!auth) {
        const requestUrl = new URL(c.req.url);
        const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
        signInUrl.searchParams.set("returnTo", `${requestUrl.pathname}${requestUrl.search}`);
        return c.redirect(signInUrl.toString(), 302);
      }

      const consentUrl = new URL(`${apiBasePath}/mcp/consent`, endpointOrigin(c));
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          consentUrl.searchParams.set(key, String(value));
        }
      }

      return c.html(
        renderMcpConsentPage({
          clientName: authRequest.clientName ?? null,
          redirectUri: query.redirect_uri,
          organizationName: auth.organization.name,
          scope: query.scope,
          approveAction: `${consentUrl.pathname}${consentUrl.search}`,
        }),
        200,
      );
    })
    .post("/mcp/consent", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");
      const authRequestToken = getCookie(c, MCP_AUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken ? parseMcpAuthorizationRequest(authRequestToken) : null;

      if (
        !authRequest ||
        authRequest.clientId !== query.client_id ||
        authRequest.redirectUri !== query.redirect_uri ||
        authRequest.codeChallenge !== query.code_challenge
      ) {
        return c.json({ error: "invalid_request" }, 400);
      }

      const auth = await resolveApiAuthContextFromSession({
        organizationSlug: query.organizationSlug ?? authRequest.organizationSlug,
      });

      if (!auth) {
        return c.json({ error: "access_denied" }, 403);
      }

      const consentGrant = createMcpConsentGrant({
        requestNonce: authRequest.nonce,
        userId: auth.user.localUserId,
        organizationId: auth.organization.localOrganizationId,
      });
      storeMcpConsentCookie(c, consentGrant);

      const callbackUrl = buildCallbackUrl(apiBasePath, endpointOrigin(c), query);
      return c.redirect(callbackUrl.toString(), 302);
    })
    .get("/mcp/callback", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");

      if (!isAllowedRedirectUri(query.redirect_uri)) {
        return c.json({ error: "invalid_redirect_uri" }, 400);
      }

      const authRequestToken = getCookie(c, MCP_AUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken ? parseMcpAuthorizationRequest(authRequestToken) : null;
      if (
        !authRequest ||
        authRequest.clientId !== query.client_id ||
        authRequest.redirectUri !== query.redirect_uri ||
        authRequest.codeChallenge !== query.code_challenge
      ) {
        return c.json({ error: "invalid_request" }, 400);
      }

      const auth = await resolveApiAuthContextFromSession({
        organizationSlug: query.organizationSlug ?? authRequest.organizationSlug,
      });

      if (!auth) {
        const requestUrl = new URL(c.req.url);
        const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
        signInUrl.searchParams.set("returnTo", `${requestUrl.pathname}${requestUrl.search}`);
        return c.redirect(signInUrl.toString(), 302);
      }

      const consentToken = getCookie(c, MCP_CONSENT_COOKIE);
      const consentGrant = consentToken ? parseMcpConsentGrant(consentToken) : null;
      const hasValidConsent =
        consentGrant &&
        consentGrant.requestNonce === authRequest.nonce &&
        consentGrant.userId === auth.user.localUserId &&
        consentGrant.organizationId === auth.organization.localOrganizationId;

      if (!hasValidConsent) {
        const consentUrl = new URL(`${apiBasePath}/mcp/consent`, endpointOrigin(c));
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined) {
            consentUrl.searchParams.set(key, String(value));
          }
        }
        return c.redirect(consentUrl.toString(), 302);
      }

      clearMcpOAuthCookies(c);
      return issueAuthorizationCodeRedirect(c, query, auth);
    })
    .post(
      "/mcp/token",
      bodyLimit({
        maxSize: 256 * 1024, // 256KB
        onError: (c) => c.json({ error: "payload_too_large" }, 413),
      }),
      async (c) => {
        const parsed = tokenRequestSchema.safeParse(await readTokenRequestBody(c.req.raw));

        if (!parsed.success) {
          return c.json({ error: "invalid_request" }, 400);
        }

        if (parsed.data.grant_type === "authorization_code") {
          const payload = parseAuthorizationCode(parsed.data.code);

          if (
            !payload ||
            payload.clientId !== parsed.data.client_id ||
            payload.redirectUri !== parsed.data.redirect_uri ||
            !verifyPkceChallenge({
              codeVerifier: parsed.data.code_verifier,
              codeChallenge: payload.codeChallenge,
              method: payload.codeChallengeMethod,
            })
          ) {
            return c.json({ error: "invalid_grant" }, 400);
          }

          const isFirstCodeUse = await markAuthorizationCodeUsed(parsed.data.code, payload);
          if (!isFirstCodeUse) {
            return c.json({ error: "invalid_grant" }, 400);
          }

          const accessToken = generateMcpToken();
          const refreshToken = generateMcpToken();
          const { accessTokenExpiresAt, refreshTokenExpiresAt } = getMcpTokenExpiry();

          await db.insert(schema.mcpSessions).values({
            userId: payload.userId,
            organizationId: payload.organizationId,
            scope: payload.scope,
            accessTokenHash: hashMcpToken(accessToken),
            refreshTokenHash: hashMcpToken(refreshToken),
            workosAccessTokenEncrypted: null,
            workosRefreshTokenEncrypted: null,
            expiresAt: accessTokenExpiresAt,
            refreshExpiresAt: refreshTokenExpiresAt,
          });

          return c.json(
            tokenResponse({
              accessToken,
              refreshToken,
              expiresIn: env.MCP_TOKEN_LIFETIME_MINUTES * 60,
              scope: payload.scope,
            }),
            200,
          );
        }

        const [session] = await db
          .select({
            id: schema.mcpSessions.id,
            scope: schema.mcpSessions.scope,
            userId: schema.users.id,
            workosUserId: schema.users.workosUserId,
            email: schema.users.email,
            organizationId: schema.organizations.id,
            workosOrganizationId: schema.organizations.workosOrganizationId,
            organizationName: schema.organizations.name,
            organizationSlug: schema.organizations.slug,
            lifecycleStatus: schema.organizations.lifecycleStatus,
          })
          .from(schema.mcpSessions)
          .innerJoin(schema.users, eq(schema.mcpSessions.userId, schema.users.id))
          .innerJoin(
            schema.organizations,
            eq(schema.mcpSessions.organizationId, schema.organizations.id),
          )
          .where(
            and(
              eq(schema.mcpSessions.refreshTokenHash, hashMcpToken(parsed.data.refresh_token)),
              gt(schema.mcpSessions.refreshExpiresAt, new Date()),
              isNull(schema.mcpSessions.revokedAt),
            ),
          )
          .limit(1);

        if (!session) {
          return c.json({ error: "invalid_grant" }, 400);
        }

        const authResult = await resolveAuthoritativeMcpSessionAuth(session);
        if (authResult.status !== "authorized") {
          return c.json({ error: "invalid_grant" }, 400);
        }

        const accessToken = generateMcpToken();
        const refreshToken = generateMcpToken();
        const { accessTokenExpiresAt, refreshTokenExpiresAt } = getMcpTokenExpiry();

        const updated = await db
          .update(schema.mcpSessions)
          .set({
            accessTokenHash: hashMcpToken(accessToken),
            refreshTokenHash: hashMcpToken(refreshToken),
            expiresAt: accessTokenExpiresAt,
            refreshExpiresAt: refreshTokenExpiresAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.mcpSessions.id, session.id),
              eq(schema.mcpSessions.refreshTokenHash, hashMcpToken(parsed.data.refresh_token)),
            ),
          )
          .returning({ id: schema.mcpSessions.id });

        if (!updated.length) {
          return c.json({ error: "invalid_grant" }, 400);
        }

        return c.json(
          tokenResponse({
            accessToken,
            refreshToken,
            expiresIn: env.MCP_TOKEN_LIFETIME_MINUTES * 60,
            scope: session.scope,
          }),
          200,
        );
      },
    )
    .use("/mcp", mcpBearerAuthMiddleware)
    .use("/mcp/sse", mcpBearerAuthMiddleware)
    .use("/mcp/message", mcpBearerAuthMiddleware)
    .all("/mcp", async (c) => handleMcpTransport(c.req.raw, c.var.mcpAuth))
    .all("/mcp/sse", async (c) => handleMcpTransport(c.req.raw, c.var.mcpAuth))
    .all("/mcp/message", async (c) => handleMcpTransport(c.req.raw, c.var.mcpAuth));
}
