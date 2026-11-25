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

import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthorizationCode } from "@/api/auth/mcp";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { resolveInboundEmailOrganization } from "@/lib/agents/email/organizations";
import { lookupMembership } from "@/lib/agents/slack/helpers";
import {
  getCanvaConnectionByOauthAccessToken,
  issueCanvaOauthTokens,
  listCanvaOauthConsentConnections,
  refreshCanvaOauthTokens,
} from "@/lib/canva/oauth";
import { db, schema } from "@/lib/database/client";
import {
  getFigmaConnectionByOauthAccessToken,
  issueFigmaOauthTokens,
  listFigmaOauthConsentConnections,
  refreshFigmaOauthTokens,
} from "@/lib/figma/oauth";
import {
  getSanityConnectionByOauthAccessToken,
  issueSanityOauthTokens,
  listSanityOauthConsentConnections,
  listSanityOauthConsentOrganizations,
  refreshSanityOauthTokens,
} from "@/lib/sanity/oauth";

import { isVendorMember } from "./vendor-membership";

/*
 * The ways into the app that never read the web session, where the session's refusal of a
 * vendor does not reach: the Slack and email assistants, plugin sign-ins, MCP, and the role as
 * it arrives from WorkOS. Each is checked for the same person first with a role that may use
 * it, so a check that would pass with the protection gone fails here.
 */

const fixture = createProjectTestFixture();
const mcpApp = createMcpTestApp();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
  await db.delete(schema.usedAuthorizationCodes);
});

async function setUp() {
  const { identity: admin, organization, project } = await fixture.createStoredProjectFixture();
  const adminId = await fixture.getLocalUserId(admin.user.workosUserId);
  const identity = fixture.createWorkosIdentityForOrganization(admin.organization, "translator");
  await fixture.authHeadersFor(identity);
  const person = {
    identity,
    id: await fixture.getLocalUserId(identity.user.workosUserId),
    email: identity.user.email,
  };

  /** Puts the person in a vendor team ("vendor"), or takes them out of it ("translator"). */
  const setRole = async (role: "vendor" | "translator") => {
    if (role === "vendor") {
      await fixture.joinVendorTeam(identity);
      return;
    }
    await db.delete(schema.teamMemberships).where(
      and(
        eq(schema.teamMemberships.userId, person.id),
        inArray(
          schema.teamMemberships.teamId,
          db
            .select({ id: schema.teams.id })
            .from(schema.teams)
            .where(
              and(
                eq(schema.teams.organizationId, organization.id),
                eq(schema.teams.isVendor, true),
              ),
            ),
        ),
      ),
    );
  };

  return { admin, adminId, organization, project, person, setRole };
}

describe("the Slack and email assistants", () => {
  it("do not know a vendor as a sender", async () => {
    const s = await setUp();
    const alias = `team-${randomUUID()}`;
    await db.insert(schema.connectors).values({
      organizationId: s.organization.id,
      kind: "email",
      enabled: true,
      config: { inboundEmailAlias: alias },
    });
    const bySlack = () =>
      lookupMembership({ email: s.person.email.toUpperCase(), organizationId: s.organization.id });
    const byEmail = () =>
      resolveInboundEmailOrganization({
        senderUserId: s.person.id,
        recipientAddresses: [`${alias}@inbox.hyperlocalise.com`],
      });

    expect((await bySlack())?.localUserId).toBe(s.person.id);
    expect((await byEmail())?.id).toBe(s.organization.id);

    await s.setRole("vendor");
    expect(await bySlack()).toBeNull();
    expect(await byEmail()).toBeNull();
  });
});

describe("plugin sign-ins", () => {
  async function addConnections(s: Awaited<ReturnType<typeof setUp>>) {
    const [apiKey] = await db
      .insert(schema.organizationApiKeys)
      .values({
        organizationId: s.organization.id,
        name: "Plugin token",
        keyHash: `hash_plugin_${randomUUID()}`,
        keyPrefix: "hl_plugi",
        permissions: ["files:write", "jobs:write"],
        createdByUserId: s.adminId,
      })
      .returning({ id: schema.organizationApiKeys.id });
    const shared = { organizationId: s.organization.id, apiKeyId: apiKey!.id };
    const [figma] = await db
      .insert(schema.figmaConnections)
      .values({
        ...shared,
        displayName: "Figma",
        connectionTokenHash: `figma_${randomUUID()}`,
        connectionTokenPrefix: "hl_figma",
      })
      .returning({ id: schema.figmaConnections.id });
    const [canva] = await db
      .insert(schema.canvaConnections)
      .values({
        ...shared,
        displayName: "Canva",
        connectionTokenHash: `canva_${randomUUID()}`,
        connectionTokenPrefix: "hl_canva",
      })
      .returning({ id: schema.canvaConnections.id });
    const [sanity] = await db
      .insert(schema.sanityConnections)
      .values({ ...shared, displayName: "Sanity" })
      .returning({ id: schema.sanityConnections.id });
    return { figma: figma!.id, canva: canva!.id, sanity: sanity!.id };
  }

  it("stop working, and cannot be renewed or made, once the person is a vendor", async () => {
    const s = await setUp();
    const connections = await addConnections(s);
    const owner = { userId: s.person.id, organizationId: s.organization.id };

    const plugins = [
      {
        name: "Figma",
        issue: () => issueFigmaOauthTokens({ ...owner, connectionId: connections.figma }),
        read: getFigmaConnectionByOauthAccessToken,
        refresh: refreshFigmaOauthTokens,
      },
      {
        name: "Canva",
        issue: () => issueCanvaOauthTokens({ ...owner, connectionId: connections.canva }),
        read: getCanvaConnectionByOauthAccessToken,
        refresh: refreshCanvaOauthTokens,
      },
      {
        name: "Sanity",
        issue: () =>
          issueSanityOauthTokens({
            ...owner,
            connectionId: connections.sanity,
            studioOrigin: "https://studio.example.com",
          }),
        read: getSanityConnectionByOauthAccessToken,
        refresh: refreshSanityOauthTokens,
      },
    ];

    for (const plugin of plugins) {
      await s.setRole("translator");
      const tokens = await plugin.issue();
      if (!tokens) {
        throw new Error(`expected ${plugin.name} tokens for a translator`);
      }
      expect((await plugin.read(tokens.accessToken))?.organizationId, plugin.name).toBe(
        s.organization.id,
      );
      const renewed = await plugin.refresh(tokens.refreshToken);
      expect(renewed, plugin.name).not.toBeNull();

      await s.setRole("vendor");
      expect(await plugin.read(renewed!.accessToken), plugin.name).toBeNull();
      expect(await plugin.refresh(renewed!.refreshToken), plugin.name).toBeNull();
      expect(await plugin.issue(), plugin.name).toBeNull();
    }
  });

  it("do not offer the connections of a workspace where the person is a vendor", async () => {
    const s = await setUp();
    await addConnections(s);
    const lists = () =>
      Promise.all([
        listFigmaOauthConsentConnections(s.person.id),
        listCanvaOauthConsentConnections(s.person.id),
        listSanityOauthConsentConnections(s.person.id),
        listSanityOauthConsentOrganizations(s.person.id),
      ]);

    expect((await lists()).map((list) => list.length)).toEqual([1, 1, 1, 1]);
    await s.setRole("vendor");
    expect((await lists()).map((list) => list.length)).toEqual([0, 0, 0, 0]);
  });
});

describe("MCP", () => {
  it("refuses a signed-in connection once the person is a vendor, and takes it back after", async () => {
    const s = await setUp();
    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const code = createAuthorizationCode({
      clientId: "test-client",
      redirectUri: "http://localhost:8787/callback",
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
      codeChallengeMethod: "S256",
      scope: "mcp",
      userId: s.person.id,
      organizationId: s.organization.id,
    });
    const tokenResponse = await mcpApp.request("http://localhost/mcp/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "test-client",
        redirect_uri: "http://localhost:8787/callback",
        code_verifier: verifier,
      }),
    });
    expect(tokenResponse.status).toBe(200);
    const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };
    const status = async () =>
      (
        await mcpApp.request("http://localhost/mcp", {
          headers: { authorization: `Bearer ${accessToken}` },
        })
      ).status;

    expect(await status()).not.toBe(401);

    await s.setRole("vendor");
    expect(await status()).toBe(401);

    // The connection is kept, so it works again when the role changes back.
    await s.setRole("translator");
    expect(await status()).not.toBe(401);
  });
});

describe("looking a person up as a vendor", () => {
  it("finds a person in a vendor team by either id, and no one else", async () => {
    const s = await setUp();
    await s.setRole("vendor");
    for (const userIdOrWorkosUserId of [s.person.id, s.person.identity.user.workosUserId]) {
      expect(
        await isVendorMember({ organizationId: s.organization.id, userIdOrWorkosUserId }),
      ).toBe(true);
    }
    expect(
      await isVendorMember({ organizationId: s.organization.id, userIdOrWorkosUserId: s.adminId }),
    ).toBe(false);
  });
});
