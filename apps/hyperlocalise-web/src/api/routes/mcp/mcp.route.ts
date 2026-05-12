import { randomUUID } from "node:crypto";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import {
  createAuthorizationCode,
  encryptMcpSecret,
  generateMcpToken,
  getMcpTokenExpiry,
  hashMcpToken,
  markAuthorizationCodeUsed,
  mcpBearerAuthMiddleware,
  parseAuthorizationCode,
  verifyPkceChallenge,
  type McpAuthVariables,
} from "@/api/auth/mcp";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

const authorizationQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  code_challenge: z.string().min(32),
  code_challenge_method: z.literal("S256"),
  scope: z.string().optional().default("mcp"),
  state: z.string().optional(),
  organizationSlug: z.string().optional(),
});

const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    redirect_uri: z.url(),
    client_id: z.string().min(1),
    code_verifier: z.string().min(43),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1).optional(),
  }),
]);

const registerClientSchema = z.object({
  client_name: z.string().min(1).optional(),
  redirect_uris: z.array(z.url()).min(1),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

function isAllowedRedirectUri(redirectUri: string): boolean {
  const url = new URL(redirectUri);

  if (url.protocol === "https:") {
    return true;
  }

  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

function endpointOrigin(c: { req: { url: string } }) {
  return new URL(c.req.url).origin;
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
    registration_endpoint: `${origin}${mcpBasePath}/register`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: "https://hyperlocalise.com",
  };
}

async function readTokenRequestBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
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

async function createMcpServerForRequest(auth: McpAuthVariables["mcpAuth"]) {
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
        .where(eq(schema.projects.organizationId, auth.organization.localOrganizationId))
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
        projectId: z.string().min(1),
      }),
    },
    async ({ projectId }) => {
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, projectId),
            eq(schema.projects.organizationId, auth.organization.localOrganizationId),
          ),
        )
        .limit(1);

      return {
        content: [{ type: "text", text: JSON.stringify({ project: project ?? null }, null, 2) }],
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
        .where(eq(schema.glossaries.organizationId, auth.organization.localOrganizationId))
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
      const [glossary] = await db
        .select({ id: schema.glossaries.id })
        .from(schema.glossaries)
        .where(
          and(
            eq(schema.glossaries.id, glossaryId),
            eq(schema.glossaries.organizationId, auth.organization.localOrganizationId),
          ),
        )
        .limit(1);

      if (!glossary) {
        return {
          content: [{ type: "text", text: JSON.stringify({ entries: [] }, null, 2) }],
        };
      }

      const entries = await db
        .select({
          id: schema.glossaryTerms.id,
          sourceTerm: schema.glossaryTerms.sourceTerm,
          targetTerm: schema.glossaryTerms.targetTerm,
          description: schema.glossaryTerms.description,
          partOfSpeech: schema.glossaryTerms.partOfSpeech,
          forbidden: schema.glossaryTerms.forbidden,
        })
        .from(schema.glossaryTerms)
        .where(eq(schema.glossaryTerms.glossaryId, glossaryId))
        .orderBy(schema.glossaryTerms.sourceTerm)
        .limit(limit);

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
  const server = await createMcpServerForRequest(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await server.close();

  return response;
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

  return new Hono<{ Variables: McpAuthVariables }>()
    .get("/.well-known/oauth-authorization-server", (c) =>
      c.json(getMcpAuthorizationServerMetadata(endpointOrigin(c), apiBasePath), 200),
    )
    .post("/mcp/register", validateRegisterBody, (c) => {
      const payload = c.req.valid("json");
      const unsupportedRedirectUri = payload.redirect_uris.find(
        (uri) => !isAllowedRedirectUri(uri),
      );

      if (unsupportedRedirectUri) {
        return c.json({ error: "invalid_redirect_uri" }, 400);
      }

      return c.json(
        {
          client_id: `mcp_${randomUUID()}`,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_name: payload.client_name,
          redirect_uris: payload.redirect_uris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          scope: payload.scope ?? "mcp",
        },
        201,
      );
    })
    .get("/mcp/authorize", validateAuthorizationQuery, (c) => {
      const query = c.req.valid("query");

      if (!isAllowedRedirectUri(query.redirect_uri)) {
        return c.json({ error: "invalid_redirect_uri" }, 400);
      }

      const callbackUrl = new URL(`${apiBasePath}/mcp/callback`, endpointOrigin(c));
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          callbackUrl.searchParams.set(key, String(value));
        }
      }

      const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
      signInUrl.searchParams.set("returnTo", `${callbackUrl.pathname}${callbackUrl.search}`);

      return c.redirect(signInUrl.toString(), 302);
    })
    .get("/mcp/callback", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");
      const auth = await resolveApiAuthContextFromSession({
        organizationSlug: query.organizationSlug,
      });

      if (!auth) {
        const requestUrl = new URL(c.req.url);
        const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
        signInUrl.searchParams.set("returnTo", `${requestUrl.pathname}${requestUrl.search}`);
        return c.redirect(signInUrl.toString(), 302);
      }

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
    })
    .post("/mcp/token", async (c) => {
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

        markAuthorizationCodeUsed(parsed.data.code);

        const accessToken = generateMcpToken();
        const refreshToken = generateMcpToken();
        const { accessTokenExpiresAt, refreshTokenExpiresAt } = getMcpTokenExpiry();

        await db.insert(schema.mcpSessions).values({
          userId: payload.userId,
          organizationId: payload.organizationId,
          accessTokenHash: hashMcpToken(accessToken),
          refreshTokenHash: hashMcpToken(refreshToken),
          workosAccessTokenEncrypted: encryptMcpSecret(null),
          workosRefreshTokenEncrypted: encryptMcpSecret(null),
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
        .select({ id: schema.mcpSessions.id })
        .from(schema.mcpSessions)
        .innerJoin(
          schema.organizationMemberships,
          and(
            eq(schema.organizationMemberships.userId, schema.mcpSessions.userId),
            eq(schema.organizationMemberships.organizationId, schema.mcpSessions.organizationId),
          ),
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

      const accessToken = generateMcpToken();
      const refreshToken = generateMcpToken();
      const { accessTokenExpiresAt, refreshTokenExpiresAt } = getMcpTokenExpiry();

      await db
        .update(schema.mcpSessions)
        .set({
          accessTokenHash: hashMcpToken(accessToken),
          refreshTokenHash: hashMcpToken(refreshToken),
          expiresAt: accessTokenExpiresAt,
          refreshExpiresAt: refreshTokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.mcpSessions.id, session.id));

      return c.json(
        tokenResponse({
          accessToken,
          refreshToken,
          expiresIn: env.MCP_TOKEN_LIFETIME_MINUTES * 60,
          scope: "mcp",
        }),
        200,
      );
    })
    .use("/mcp/sse", mcpBearerAuthMiddleware)
    .use("/mcp/message", mcpBearerAuthMiddleware)
    .all("/mcp/sse", async (c) => handleMcpTransport(c.req.raw, c.var.mcpAuth))
    .all("/mcp/message", async (c) => handleMcpTransport(c.req.raw, c.var.mcpAuth));
}
