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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

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

import { createApp } from "@/api/app";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database";

import { createTeamTestFixture } from "../team/team.fixture";
import type { TeamResponse } from "../team/team.schema";
import type { ProjectResponse } from "../project/project.schema";
import { createGlossaryTestFixture } from "./glossary.fixture";

const client = testClient(createApp());
const fixture = createGlossaryTestFixture(client);
const teamFixture = createTeamTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("glossaryRoutes", () => {
  it("denies glossary creation for members without glossary write access", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "Marketing Glossary",
          description: "Marketing terminology",
          sourceLocale: "en",
          targetLocale: "es",
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "forbidden",
    });
  });

  it("imports CSV glossary terms and reports skipped duplicate rows", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    expect(createBody).toMatchObject({
      glossary: { id: expect.any(String) },
    });
    const glossaryId = (createBody as { glossary: { id: string } }).glossary.id;

    const response = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms.import.$post(
      {
        param: {
          organizationSlug,
          glossaryId,
        },
        json: {
          format: "csv",
          content: [
            "sourceTerm,targetTerm,description,partOfSpeech",
            "CTA,Llamada a la accion,Button copy,noun",
            "cta,Llamada a la accion duplicada,Duplicate,noun",
            "Hero,Heroe,Homepage heading,noun",
          ].join("\n"),
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const importBody = (await response.json()) as {
      imported: number;
      skipped: number;
      glossaryTerms: Array<{
        sourceTerm: string;
        targetTerm: string;
        description: string;
        partOfSpeech: string;
        forbidden: boolean;
        caseSensitive: boolean;
      }>;
    };
    expect(importBody).toMatchObject({
      imported: 2,
      skipped: 1,
    });
    expect(importBody.glossaryTerms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceTerm: "CTA",
          targetTerm: "Llamada a la accion",
          description: "Button copy",
          partOfSpeech: "noun",
          forbidden: false,
          caseSensitive: false,
        }),
        expect.objectContaining({
          sourceTerm: "Hero",
          targetTerm: "Heroe",
          description: "Homepage heading",
          partOfSpeech: "noun",
          forbidden: false,
          caseSensitive: false,
        }),
      ]),
    );
    expect(importBody.glossaryTerms).toHaveLength(2);
  });

  it("rejects term mutations for externally managed glossaries", async () => {
    const { identity, organization, user, glossary } = await fixture.createStoredGlossaryFixture();
    const headers = await fixture.authHeadersFor(identity);

    await db
      .update(schema.glossaries)
      .set({
        source: "external_tms",
        externalProviderKind: "crowdin",
        externalProjectId: "external-project-1",
        externalResourceType: "glossary",
        externalGlossaryId: "external-glossary-1",
      })
      .where(eq(schema.glossaries.id, glossary.id));

    const response = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          glossaryId: glossary.id,
        },
        json: {
          sourceTerm: "Checkout",
          targetTerm: "Pago",
          caseSensitive: false,
          forbidden: false,
        },
      },
      { headers },
    );

    expect(user.id).toBe(glossary.createdByUserId);
    expect(organization.id).toBe(glossary.organizationId);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "external_tms_glossary_immutable",
    });
  });

  it("hides other teams' projects from glossary project listings for team-scoped members", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const member = fixture.createWorkosIdentityForOrganization(admin.organization, "member");
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    await fixture.authHeadersFor(member);

    const createGlossaryResponse = await fixture.createGlossaryViaApi(
      admin,
      undefined,
      adminHeaders,
    );
    expect(createGlossaryResponse.status).toBe(201);
    const glossaryId = ((await createGlossaryResponse.json()) as { glossary: { id: string } })
      .glossary.id;

    const teamAlphaResponse = await teamFixture.createTeamViaApi(admin, { name: "Alpha Team" });
    expect(teamAlphaResponse.status).toBe(201);
    const teamAlphaBody = (await teamAlphaResponse.json()) as TeamResponse;

    const teamBetaResponse = await teamFixture.createTeamViaApi(admin, { name: "Beta Team" });
    expect(teamBetaResponse.status).toBe(201);
    const teamBetaBody = (await teamBetaResponse.json()) as TeamResponse;

    await db.insert(schema.teamMemberships).values({
      teamId: teamAlphaBody.team.id,
      userId: await fixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const alphaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Alpha Project",
          teamId: teamAlphaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["es-ES"],
        },
      },
      { headers: adminHeaders },
    );
    expect(alphaProjectResponse.status).toBe(201);
    const alphaProject = ((await alphaProjectResponse.json()) as ProjectResponse).project;

    const betaProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Beta Secret Project",
          teamId: teamBetaBody.team.id,
          sourceLocale: "en-US",
          targetLocales: ["de-DE"],
        },
      },
      { headers: adminHeaders },
    );
    expect(betaProjectResponse.status).toBe(201);
    const betaProject = ((await betaProjectResponse.json()) as ProjectResponse).project;

    for (const projectId of [alphaProject.id, betaProject.id]) {
      const attachResponse = await client.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects.$post(
        {
          param: { organizationSlug, glossaryId },
          json: { projectId, priority: 1 },
        },
        { headers: adminHeaders },
      );
      expect(attachResponse.status).toBe(200);
    }

    const memberListResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].projects.$get(
      { param: { organizationSlug, glossaryId } },
      { headers: await fixture.authHeadersFor(member) },
    );
    expect(memberListResponse.status).toBe(200);
    const memberListBody = (await memberListResponse.json()) as {
      projects: Array<{ projectId: string; projectName: string }>;
    };
    expect(memberListBody.projects).toEqual([
      expect.objectContaining({
        projectId: alphaProject.id,
        projectName: "Alpha Project",
      }),
    ]);
    expect(memberListBody.projects.map((project) => project.projectId)).not.toContain(
      betaProject.id,
    );
  });

  it("emits product usage analytics when creating a glossary and a term", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const trackSpy = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});

    const createResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    expect(createResponse.status).toBe(201);
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.glossaryCreated, {
      status: "created",
      source: "glossary",
    });

    const glossaryId = ((await createResponse.json()) as { glossary: { id: string } }).glossary.id;
    const termResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          glossaryId,
        },
        json: {
          sourceTerm: "Checkout",
          targetTerm: "Pago",
          caseSensitive: false,
          forbidden: false,
        },
      },
      { headers },
    );

    expect(termResponse.status).toBe(201);
    expect(trackSpy).toHaveBeenCalledWith(PRODUCT_USAGE_ANALYTICS_EVENTS.glossaryTermCreated, {
      status: "created",
      source: "glossary",
    });
    trackSpy.mockRestore();
  });
});
