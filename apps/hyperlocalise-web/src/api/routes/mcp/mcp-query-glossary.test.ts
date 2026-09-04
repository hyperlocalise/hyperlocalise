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
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { generateMcpToken, hashMcpToken } from "@/api/auth/mcp";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const mcpApp = createMcpTestApp();
const fixture = createProjectTestFixture();

type McpGlossaryHit = {
  glossaryId: string;
  conceptId: string;
  sourceTerm: string;
  targetTerm: string;
  forbidden: boolean;
  status: string;
  partOfSpeech: string;
  caseSensitive: boolean;
  description: string;
};

type McpQueryGlossaryOutput = {
  error?: string;
  message?: string;
  terms?: McpGlossaryHit[];
};

async function authenticatedMcpHeaders(identity = fixture.createWorkosIdentity()) {
  const headers = await fixture.authHeadersFor(identity);

  const accessToken = generateMcpToken();
  const refreshToken = generateMcpToken();

  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("expected test auth context");
  }

  await db.insert(schema.mcpSessions).values({
    userId: auth.user.localUserId,
    organizationId: auth.organization.localOrganizationId,
    scope: "mcp",
    accessTokenHash: hashMcpToken(accessToken),
    refreshTokenHash: hashMcpToken(refreshToken),
    expiresAt: new Date(Date.now() + 60_000),
    refreshExpiresAt: new Date(Date.now() + 120_000),
  });

  return {
    ...headers,
    authorization: `Bearer ${accessToken}`,
  };
}

async function callMcpTool(headers: Record<string, string>, args: Record<string, unknown> = {}) {
  return mcpApp.request("http://localhost/mcp", {
    method: "POST",
    headers: {
      ...headers,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "query_glossary",
        arguments: args,
      },
    }),
  });
}

async function readToolResult(response: Response) {
  expect(response.status).toBe(200);

  const body = (await response.json()) as {
    result?: {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
  };

  const text = body.result?.content?.[0]?.text;
  expect(text).toBeDefined();

  return {
    isError: body.result?.isError === true,
    output: JSON.parse(text!) as McpQueryGlossaryOutput,
  };
}

async function insertNativeGlossaryPair(input: {
  organizationId: string;
  createdByUserId?: string;
  name: string;
  sourceTerm: string;
  targetTerm: string;
  targetStatus?: string;
  description?: string;
  partOfSpeech?: string;
  caseSensitive?: boolean;
  targetForbidden?: boolean;
}) {
  const [glossary] = await db
    .insert(schema.glossaries)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      description: "",
      sourceLocale: "en",
      targetLocale: null,
      status: "active",
    })
    .returning();

  const [concept] = await db
    .insert(schema.glossaryConcepts)
    .values({
      glossaryId: glossary.id,
      primaryTerm: input.sourceTerm,
    })
    .returning();

  await db.insert(schema.glossaryTerms).values({
    glossaryId: glossary.id,
    conceptId: concept.id,
    locale: "en",
    term: input.sourceTerm,
    sourceTerm: input.sourceTerm,
    targetTerm: input.sourceTerm,
    description: input.description ?? "",
    partOfSpeech: input.partOfSpeech ?? "",
    status: "preferred",
    caseSensitive: input.caseSensitive ?? false,
    reviewStatus: "approved",
  });

  await db.insert(schema.glossaryTerms).values({
    glossaryId: glossary.id,
    conceptId: concept.id,
    locale: "fr",
    term: input.targetTerm,
    sourceTerm: input.targetTerm,
    targetTerm: input.targetTerm,
    description: "",
    partOfSpeech: input.partOfSpeech ?? "",
    status: input.targetStatus ?? "preferred",
    forbidden: input.targetForbidden ?? false,
    reviewStatus: "approved",
  });

  return { glossary, concept };
}

describe("MCP query_glossary", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("advertises query_glossary with a bounded locale search schema", async () => {
    const headers = await authenticatedMcpHeaders();

    const response = await mcpApp.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        ...headers,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result?: {
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: {
            required?: string[];
            properties?: Record<string, unknown>;
          };
        }>;
      };
    };

    const tool = body.result?.tools?.find(({ name }) => name === "query_glossary");

    expect(tool).toBeDefined();
    expect(tool?.description).toContain("concept-linked");
    expect(tool?.inputSchema?.required).toEqual(["sourceText", "sourceLocale", "targetLocale"]);
    expect(tool?.inputSchema?.properties).toMatchObject({
      sourceText: {
        type: "string",
      },
      sourceLocale: {
        type: "string",
        minLength: 1,
        maxLength: 50,
      },
      targetLocale: {
        type: "string",
        minLength: 1,
        maxLength: 50,
      },
      projectId: {
        type: "string",
        minLength: 1,
        maxLength: 128,
      },
      glossaryId: {
        type: "string",
        minLength: 1,
        maxLength: 128,
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        default: 10,
      },
    });
  });

  it("returns no terms for an empty query", async () => {
    const stored = await fixture.createStoredProjectFixture();
    await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "   ",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.terms).toEqual([]);
  });

  it("marks forbidden hits so agents can avoid them", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const { glossary, concept } = await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "caisse",
      targetStatus: "not_recommended",
      description: "Payment step in the cart",
      partOfSpeech: "noun",
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.terms).toEqual([
      {
        glossaryId: glossary.id,
        conceptId: concept.id,
        sourceTerm: "checkout",
        targetTerm: "caisse",
        forbidden: true,
        status: "not_recommended",
        partOfSpeech: "noun",
        caseSensitive: false,
        description: "Payment step in the cart",
      },
    ]);
  });

  it("matches a glossary term contained in a longer source string", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const { glossary } = await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "Proceed to checkout",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.terms).toEqual([
      expect.objectContaining({
        glossaryId: glossary.id,
        sourceTerm: "checkout",
        targetTerm: "paiement",
      }),
    ]);
  });

  it("does not return a case-sensitive term for a differently cased query", async () => {
    const stored = await fixture.createStoredProjectFixture();
    await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Brand",
      sourceTerm: "NASA",
      targetTerm: "NASA",
      caseSensitive: true,
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const missed = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "nasa",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );
    const matched = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "NASA launches today",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );

    expect(missed.output.terms).toEqual([]);
    expect(matched.output.terms).toEqual([
      expect.objectContaining({
        sourceTerm: "NASA",
        targetTerm: "NASA",
        caseSensitive: true,
      }),
    ]);
  });

  it("marks an explicit forbidden flag even when status is preferred", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);
    await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "caisse",
      targetStatus: "preferred",
      targetForbidden: true,
    });

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );

    expect(result.output.terms).toEqual([
      expect.objectContaining({
        targetTerm: "caisse",
        forbidden: true,
        status: "preferred",
      }),
    ]);
  });

  it("returns glossary_not_found for a non-UUID glossary ID without querying", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
        glossaryId: "missing",
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toMatchObject({
      error: "glossary_not_found",
    });
  });

  it("returns glossary_not_found for a Crowdin live glossary ID", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
        glossaryId: "crowdin:glossary:42",
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toMatchObject({
      error: "glossary_not_found",
    });
  });

  it("does not leak unlinked glossaries when a project ID is set", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const linked = await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Linked",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
    await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Unlinked",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });

    await db.insert(schema.projectGlossaries).values({
      organizationId: stored.organization.id,
      projectId: stored.project.id,
      glossaryId: linked.glossary.id,
    });

    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
        projectId: stored.project.id,
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.terms).toEqual([
      expect.objectContaining({
        glossaryId: linked.glossary.id,
        targetTerm: "paiement",
        forbidden: false,
      }),
    ]);
  });

  it("returns glossary_not_found for an explicit inaccessible glossary", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const other = await fixture.createStoredProjectFixture();
    const hidden = await insertNativeGlossaryPair({
      organizationId: other.organization.id,
      createdByUserId: other.user.id,
      name: "Other org",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
        glossaryId: hidden.glossary.id,
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toMatchObject({
      error: "glossary_not_found",
    });
  });

  it("returns glossary_not_found for provider glossary IDs", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
        glossaryId: "smartling:glossary:term-base-1",
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toMatchObject({
      error: "glossary_not_found",
    });
  });

  it("returns no terms for an inaccessible project ID", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const other = await fixture.createStoredProjectFixture();
    await insertNativeGlossaryPair({
      organizationId: other.organization.id,
      createdByUserId: other.user.id,
      name: "Other org",
      sourceTerm: "checkout",
      targetTerm: "caisse",
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
        projectId: other.project.id,
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.terms).toEqual([]);
  });

  it("truncates long descriptions and ignores leftover term-based rows", async () => {
    const stored = await fixture.createStoredProjectFixture();
    const longDescription = `${"context ".repeat(80)}end`;
    const { glossary } = await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Commerce",
      sourceTerm: "checkout",
      targetTerm: "paiement",
      description: longDescription,
    });

    await db.insert(schema.glossaryTerms).values({
      glossaryId: glossary.id,
      conceptId: null,
      locale: null,
      term: null,
      sourceTerm: "invoice",
      targetTerm: "facture-legacy",
      description: "should not appear",
      reviewStatus: "approved",
    });

    const headers = await authenticatedMcpHeaders(stored.identity);

    const leftoverResult = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "invoice",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );
    const conceptResult = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );

    expect(leftoverResult.output.terms).toEqual([]);
    expect(conceptResult.output.terms).toHaveLength(1);
    expect(conceptResult.output.terms?.[0]?.description).toHaveLength(500);
    expect(longDescription.length).toBeGreaterThan(500);
    expect(conceptResult.output.terms?.[0]?.description).toBe(longDescription.slice(0, 500));
  });

  it("does not return glossary terms from another organization without an explicit ID", async () => {
    const stored = await fixture.createStoredProjectFixture();
    await insertNativeGlossaryPair({
      organizationId: stored.organization.id,
      createdByUserId: stored.user.id,
      name: "Current",
      sourceTerm: "checkout",
      targetTerm: "paiement",
    });
    await fixture.createStoredProjectFixture().then(async (other) => {
      await insertNativeGlossaryPair({
        organizationId: other.organization.id,
        createdByUserId: other.user.id,
        name: "Other",
        sourceTerm: "checkout",
        targetTerm: "caisse",
      });
    });
    const headers = await authenticatedMcpHeaders(stored.identity);

    const result = await readToolResult(
      await callMcpTool(headers, {
        sourceText: "checkout",
        sourceLocale: "en",
        targetLocale: "fr",
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.output.terms).toEqual([
      expect.objectContaining({
        targetTerm: "paiement",
      }),
    ]);
  });
});
