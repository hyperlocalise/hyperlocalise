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

import { and, eq } from "drizzle-orm";
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
import { GlossaryValidationError } from "@/lib/glossary/glossary";
import { NativeGlossary } from "@/lib/glossary/native-glossary";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

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

  it("creates a concept with additional terms atomically", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const glossaryResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    const glossaryId = ((await glossaryResponse.json()) as { glossary: { id: string } }).glossary
      .id;

    const response = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: { organizationSlug, glossaryId },
        json: {
          primaryTerm: "Checkout",
          subject: "Commerce",
          translatable: true,
          terms: [
            {
              locale: "en",
              term: "Check-out",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
            {
              locale: "en",
              term: "Payment",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
            {
              locale: "vi-VN",
              term: "Thanh toán",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
            {
              locale: "en-US",
              term: "Check-out",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
          ],
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      concept: {
        primaryTerm: string;
        terms: Array<{ locale: string; term: string; status: string }>;
      };
    };
    expect(body.concept).toMatchObject({ primaryTerm: "Checkout" });
    expect(body.concept.terms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: "en", term: "Checkout", status: "preferred" }),
        expect.objectContaining({ locale: "en", term: "Payment", status: "draft" }),
        expect.objectContaining({ locale: "vi-VN", term: "Thanh toán", status: "draft" }),
        expect.objectContaining({ locale: "en-US", term: "Check-out", status: "draft" }),
      ]),
    );
  });

  it("preserves omitted concept fields during a sparse patch", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const glossaryResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    const glossaryId = ((await glossaryResponse.json()) as { glossary: { id: string } }).glossary
      .id;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: { organizationSlug, glossaryId },
        json: {
          primaryTerm: "Checkout",
          subject: "Commerce",
          definition: "A payment step",
          note: "Keep this note",
          translatable: true,
          terms: [
            {
              locale: "vi",
              term: "Thanh toán",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
          ],
        },
      },
      { headers },
    );
    const conceptId = ((await createResponse.json()) as { concept: { id: string } }).concept.id;

    const patchResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts[":conceptId"].$patch(
      {
        param: { organizationSlug, glossaryId, conceptId },
        json: { definition: "An updated payment step" },
      },
      { headers },
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      concept: {
        primaryTerm: "Checkout",
        subject: "Commerce",
        definition: "An updated payment step",
        note: "Keep this note",
        terms: expect.arrayContaining([
          expect.objectContaining({ locale: "en", term: "Checkout" }),
        ]),
      },
    });
  });

  it("rejects term creation for a concept owned by another organization", async () => {
    const firstIdentity = fixture.createWorkosIdentityWithRole("admin");
    const secondIdentity = fixture.createWorkosIdentityWithRole("admin");
    const firstHeaders = await fixture.authHeadersFor(firstIdentity);
    const secondHeaders = await fixture.authHeadersFor(secondIdentity);
    const firstOrganizationSlug = firstIdentity.organization.slug ?? "missing-slug";
    const secondOrganizationSlug = secondIdentity.organization.slug ?? "missing-slug";

    const firstGlossaryResponse = await fixture.createGlossaryViaApi(
      firstIdentity,
      undefined,
      firstHeaders,
    );
    const firstGlossaryId = ((await firstGlossaryResponse.json()) as { glossary: { id: string } })
      .glossary.id;
    const secondGlossaryResponse = await fixture.createGlossaryViaApi(
      secondIdentity,
      undefined,
      secondHeaders,
    );
    const secondGlossaryId = ((await secondGlossaryResponse.json()) as { glossary: { id: string } })
      .glossary.id;

    const conceptResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: {
          organizationSlug: secondOrganizationSlug,
          glossaryId: secondGlossaryId,
        },
        json: {
          primaryTerm: "Private term",
          translatable: true,
          terms: [],
        },
      },
      { headers: secondHeaders },
    );
    const conceptId = ((await conceptResponse.json()) as { concept: { id: string } }).concept.id;

    const response = await client.api.orgs[":organizationSlug"].glossaries[":glossaryId"].concepts[
      ":conceptId"
    ].terms.$post(
      {
        param: {
          organizationSlug: firstOrganizationSlug,
          glossaryId: firstGlossaryId,
          conceptId,
        },
        json: {
          locale: "fr",
          term: "Terme privé",
          status: "draft",
          caseSensitive: false,
          forbidden: false,
        },
      },
      { headers: firstHeaders },
    );

    expect(response.status).toBe(404);
    const injectedTerms = await db
      .select({ id: schema.glossaryTerms.id })
      .from(schema.glossaryTerms)
      .where(
        and(
          eq(schema.glossaryTerms.glossaryId, firstGlossaryId),
          eq(schema.glossaryTerms.conceptId, conceptId),
        ),
      );
    expect(injectedTerms).toEqual([]);
  });

  it("rolls back concept and term updates when a later term upsert fails", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const glossaryResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    const glossaryId = ((await glossaryResponse.json()) as { glossary: { id: string } }).glossary
      .id;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: { organizationSlug, glossaryId },
        json: {
          primaryTerm: "Checkout",
          definition: "Original definition",
          translatable: true,
          terms: [
            {
              locale: "vi",
              term: "Thanh toán",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
          ],
        },
      },
      { headers },
    );
    const concept = (await createResponse.json()) as {
      concept: {
        id: string;
        terms: Array<{ id: string; locale: string; term: string }>;
      };
    };
    const conceptId = concept.concept.id;
    const vietnameseTerm = concept.concept.terms.find((term) => term.locale === "vi");
    expect(vietnameseTerm).toBeDefined();

    const patchResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts[":conceptId"].$patch(
      {
        param: { organizationSlug, glossaryId, conceptId },
        json: {
          definition: "Definition that must roll back",
          terms: [
            {
              id: vietnameseTerm!.id,
              locale: "vi",
              term: "Thanh toán mới",
            },
            {
              locale: "vi",
              term: "Thanh toán mới",
            },
          ],
        },
      },
      { headers },
    );

    expect(patchResponse.status).toBe(500);
    const [storedConcept] = await db
      .select({ definition: schema.glossaryConcepts.definition })
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.id, conceptId))
      .limit(1);
    const [storedTerm] = await db
      .select({ term: schema.glossaryTerms.term })
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.id, vietnameseTerm!.id))
      .limit(1);
    expect(storedConcept?.definition).toBe("Original definition");
    expect(storedTerm?.term).toBe("Thanh toán");
  });

  it("allows the primary source term when creating a concept", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const glossaryResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    const glossaryId = ((await glossaryResponse.json()) as { glossary: { id: string } }).glossary
      .id;

    const response = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: { organizationSlug, glossaryId },
        json: {
          primaryTerm: "Checkout",
          translatable: true,
          terms: [
            {
              locale: "en",
              term: "checkout",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
          ],
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      concept: {
        primaryTerm: "Checkout",
        terms: [{ locale: "en", term: "Checkout" }],
      },
    });
  });

  it("deletes native concept terms omitted from a concept PATCH payload", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const glossaryResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    const glossaryId = ((await glossaryResponse.json()) as { glossary: { id: string } }).glossary
      .id;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: { organizationSlug, glossaryId },
        json: {
          primaryTerm: "Checkout",
          translatable: true,
          terms: [
            {
              locale: "en",
              term: "Checkout",
              status: "preferred",
              caseSensitive: false,
              forbidden: false,
            },
            {
              locale: "vi",
              term: "Thanh toán",
              status: "draft",
              caseSensitive: false,
              forbidden: false,
            },
          ],
        },
      },
      { headers },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      concept: {
        id: string;
        terms: Array<{ id: string; locale: string; term: string }>;
      };
    };
    const sourceTerm = created.concept.terms.find((term) => term.locale === "en");
    const vietnameseTerm = created.concept.terms.find((term) => term.locale === "vi");
    expect(sourceTerm).toBeDefined();
    expect(vietnameseTerm).toBeDefined();

    const patchResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts[":conceptId"].$patch(
      {
        param: { organizationSlug, glossaryId, conceptId: created.concept.id },
        json: {
          primaryTerm: "Checkout",
          terms: [
            {
              id: sourceTerm!.id,
              locale: "en",
              term: "Checkout",
              status: "preferred",
            },
          ],
        },
      },
      { headers },
    );

    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as {
      concept: { terms: Array<{ id: string; locale: string }> };
    };
    expect(patched.concept.terms.map((term) => term.id)).toEqual([sourceTerm!.id]);

    const remaining = await db
      .select({ id: schema.glossaryTerms.id, locale: schema.glossaryTerms.locale })
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.conceptId, created.concept.id));
    expect(remaining).toEqual([{ id: sourceTerm!.id, locale: "en" }]);
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

  it("returns the attached project count when creating a glossary", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Attached Project",
          sourceLocale: "en",
          targetLocales: ["es-ES"],
        },
      },
      { headers },
    );
    expect(projectResponse.status).toBe(201);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Linked Glossary",
          description: "Created with a project",
          sourceLocale: "en",
          projectIds: [project.id],
        },
      },
      { headers },
    );

    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      glossary: { projectCount: 1 },
    });
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

  it("returns Crowdin validation details when concept create fails validation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const glossaryResponse = await fixture.createGlossaryViaApi(identity, undefined, headers);
    const glossaryId = ((await glossaryResponse.json()) as { glossary: { id: string } }).glossary
      .id;

    const createConceptSpy = vi.spyOn(NativeGlossary.prototype, "createConcept").mockRejectedValue(
      new GlossaryValidationError("crowdin_validation_failed", "Term text is too short", {
        provider: "crowdin",
        errors: [{ key: "term", errors: ["too short"] }],
      }),
    );

    try {
      const response = await client.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.$post(
        {
          param: { organizationSlug, glossaryId },
          json: {
            primaryTerm: "x",
            translatable: true,
          },
        },
        { headers },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "crowdin_validation_failed",
        message: "Term text is too short",
        details: {
          provider: "crowdin",
          errors: [{ key: "term", errors: ["too short"] }],
        },
      });
    } finally {
      createConceptSpy.mockRestore();
    }
  });

  it("lets translators create a team glossary attached to an accessible project", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const translator = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const translatorHeaders = await fixture.authHeadersFor(translator);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Alpha Team" });
    expect(teamResponse.status).toBe(201);
    const team = ((await teamResponse.json()) as TeamResponse).team;

    await db.insert(schema.teamMemberships).values({
      teamId: team.id,
      userId: await fixture.getLocalUserId(translator.user.workosUserId),
      role: "member",
    });

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Alpha Project",
          teamId: team.id,
          sourceLocale: "en-US",
          targetLocales: ["es-ES"],
        },
      },
      { headers: adminHeaders },
    );
    expect(projectResponse.status).toBe(201);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Team terms",
          sourceLocale: "en-US",
          controlLevel: "team",
          projectIds: [project.id],
        },
      },
      { headers: translatorHeaders },
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      glossary: { id: string; controlLevel: string; source: string };
    };
    expect(created.glossary).toMatchObject({ controlLevel: "team", source: "native" });

    const conceptResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: { organizationSlug, glossaryId: created.glossary.id },
        json: { primaryTerm: "Checkout", translatable: true },
      },
      { headers: translatorHeaders },
    );
    expect(conceptResponse.status).toBe(201);
  });

  it("creates concept-backed terms when a translator posts to /terms on a team glossary", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const translator = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const translatorHeaders = await fixture.authHeadersFor(translator);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Terms Team" });
    expect(teamResponse.status).toBe(201);
    const team = ((await teamResponse.json()) as TeamResponse).team;

    await db.insert(schema.teamMemberships).values({
      teamId: team.id,
      userId: await fixture.getLocalUserId(translator.user.workosUserId),
      role: "member",
    });

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Terms Project",
          teamId: team.id,
          sourceLocale: "en-US",
          targetLocales: ["es-ES"],
        },
      },
      { headers: adminHeaders },
    );
    expect(projectResponse.status).toBe(201);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Team HTTP terms",
          sourceLocale: "en-US",
          controlLevel: "team",
          projectIds: [project.id],
        },
      },
      { headers: translatorHeaders },
    );
    expect(createResponse.status).toBe(201);
    const glossaryId = ((await createResponse.json()) as { glossary: { id: string } }).glossary.id;

    const termResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms.$post(
      {
        param: { organizationSlug, glossaryId },
        json: {
          sourceTerm: "Checkout",
          targetTerm: "Pago",
          caseSensitive: false,
          forbidden: false,
        },
      },
      { headers: translatorHeaders },
    );
    expect(termResponse.status).toBe(201);
    const createdTerm = (await termResponse.json()) as {
      glossaryTerm: { id: string; sourceTerm: string; targetTerm: string };
    };
    expect(createdTerm.glossaryTerm).toMatchObject({
      sourceTerm: "Checkout",
      targetTerm: "Pago",
    });

    const [storedTerm] = await db
      .select({
        conceptId: schema.glossaryTerms.conceptId,
        locale: schema.glossaryTerms.locale,
        term: schema.glossaryTerms.term,
      })
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.id, createdTerm.glossaryTerm.id))
      .limit(1);
    expect(storedTerm?.conceptId).toBeTruthy();
    expect(storedTerm?.term).toBe("Pago");

    const conceptsResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$get(
      {
        param: { organizationSlug, glossaryId },
      },
      { headers: translatorHeaders },
    );
    expect(conceptsResponse.status).toBe(200);
    await expect(conceptsResponse.json()).resolves.toMatchObject({
      concepts: expect.arrayContaining([
        expect.objectContaining({
          primaryTerm: "Checkout",
          terms: expect.arrayContaining([
            expect.objectContaining({ locale: "en-US", text: "Checkout" }),
            expect.objectContaining({ locale: "es-ES", text: "Pago" }),
          ]),
        }),
      ]),
    });
  });

  it("rejects translator team glossary creation on an external TMS project", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const translator = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const translatorHeaders = await fixture.authHeadersFor(translator);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = await fixture.getLocalUserId(translator.user.workosUserId);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Crowdin Team" });
    expect(teamResponse.status).toBe(201);
    const team = ((await teamResponse.json()) as TeamResponse).team;

    await db.insert(schema.teamMemberships).values({
      teamId: team.id,
      userId,
      role: "member",
    });

    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902807",
    });
    await db.insert(schema.projects).values({
      id: projectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      teamId: team.id,
      createdByUserId: userId,
      updatedByUserId: userId,
      name: "Materialized Crowdin Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "902807",
      sourceLocale: "en-US",
      targetLocales: ["es-ES"],
      isActive: true,
    });

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Team terms from Crowdin",
          sourceLocale: "en-US",
          controlLevel: "team",
          projectIds: [projectId],
        },
      },
      { headers: translatorHeaders },
    );
    expect(createResponse.status).toBe(400);
    await expect(createResponse.json()).resolves.toMatchObject({
      error: "glossary_team_native_project_required",
    });
  });

  it("keeps org glossaries read-only for translators", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const translator = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const translatorHeaders = await fixture.authHeadersFor(translator);

    const orgCreate = await fixture.createGlossaryViaApi(admin, undefined, adminHeaders);
    expect(orgCreate.status).toBe(201);
    const orgCreateBody = (await orgCreate.json()) as {
      glossary: { id: string; controlLevel: string };
    };
    expect(orgCreateBody.glossary.controlLevel).toBe("org");
    const orgGlossaryId = orgCreateBody.glossary.id;

    const translatorOrgCreate = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Org from translator",
          sourceLocale: "en",
          controlLevel: "org",
        },
      },
      { headers: translatorHeaders },
    );
    expect(translatorOrgCreate.status).toBe(403);

    const translatorTeamWithoutProject = await client.api.orgs[
      ":organizationSlug"
    ].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Team without project",
          sourceLocale: "en",
          controlLevel: "team",
        },
      },
      { headers: translatorHeaders },
    );
    expect(translatorTeamWithoutProject.status).toBe(403);
    await expect(translatorTeamWithoutProject.json()).resolves.toMatchObject({
      error: "glossary_team_project_required",
    });

    const conceptResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].concepts.$post(
      {
        param: { organizationSlug, glossaryId: orgGlossaryId },
        json: { primaryTerm: "Checkout", translatable: true },
      },
      { headers: translatorHeaders },
    );
    expect(conceptResponse.status).toBe(403);
    await expect(conceptResponse.json()).resolves.toMatchObject({
      error: "glossary_org_controlled",
    });
  });

  it("rejects attaching an external TMS project to a team glossary", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const translator = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const translatorHeaders = await fixture.authHeadersFor(translator);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = await fixture.getLocalUserId(translator.user.workosUserId);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Attach Guard Team" });
    expect(teamResponse.status).toBe(201);
    const team = ((await teamResponse.json()) as TeamResponse).team;

    await db.insert(schema.teamMemberships).values({
      teamId: team.id,
      userId,
      role: "member",
    });

    const nativeProjectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Native Attach Project",
          teamId: team.id,
          sourceLocale: "en-US",
          targetLocales: ["es-ES"],
        },
      },
      { headers: adminHeaders },
    );
    expect(nativeProjectResponse.status).toBe(201);
    const nativeProject = ((await nativeProjectResponse.json()) as ProjectResponse).project;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Team attach guard",
          sourceLocale: "en-US",
          controlLevel: "team",
          projectIds: [nativeProject.id],
        },
      },
      { headers: translatorHeaders },
    );
    expect(createResponse.status).toBe(201);
    const glossaryId = ((await createResponse.json()) as { glossary: { id: string } }).glossary.id;

    const externalProjectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902808",
    });
    await db.insert(schema.projects).values({
      id: externalProjectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      teamId: team.id,
      createdByUserId: userId,
      updatedByUserId: userId,
      name: "External Attach Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "902808",
      sourceLocale: "en-US",
      targetLocales: ["es-ES"],
      isActive: true,
    });

    const attachResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].projects.$post(
      {
        param: { organizationSlug, glossaryId },
        json: { projectId: externalProjectId, priority: 1 },
      },
      { headers: adminHeaders },
    );
    expect(attachResponse.status).toBe(400);
    await expect(attachResponse.json()).resolves.toMatchObject({
      error: "glossary_team_native_project_required",
    });
  });

  it("rejects switching to team control without attached projects", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);

    const createResponse = await fixture.createGlossaryViaApi(admin, undefined, adminHeaders);
    expect(createResponse.status).toBe(201);
    const glossaryId = ((await createResponse.json()) as { glossary: { id: string } }).glossary.id;

    const patchResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].$patch(
      {
        param: { organizationSlug, glossaryId },
        json: { controlLevel: "team" },
      },
      { headers: adminHeaders },
    );
    expect(patchResponse.status).toBe(403);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: "glossary_team_project_required",
    });
  });

  it("rejects switching to team control when an external project is attached", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = await fixture.getLocalUserId(admin.user.workosUserId);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Patch Guard Team" });
    expect(teamResponse.status).toBe(201);
    const team = ((await teamResponse.json()) as TeamResponse).team;

    const externalProjectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902809",
    });
    await db.insert(schema.projects).values({
      id: externalProjectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      teamId: team.id,
      createdByUserId: userId,
      updatedByUserId: userId,
      name: "External Patch Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "902809",
      sourceLocale: "en-US",
      targetLocales: ["es-ES"],
      isActive: true,
    });

    const createResponse = await fixture.createGlossaryViaApi(admin, undefined, adminHeaders);
    expect(createResponse.status).toBe(201);
    const glossaryId = ((await createResponse.json()) as { glossary: { id: string } }).glossary.id;

    const attachResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].projects.$post(
      {
        param: { organizationSlug, glossaryId },
        json: { projectId: externalProjectId, priority: 0 },
      },
      { headers: adminHeaders },
    );
    expect(attachResponse.status).toBe(200);

    const patchResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].$patch(
      {
        param: { organizationSlug, glossaryId },
        json: { controlLevel: "team" },
      },
      { headers: adminHeaders },
    );
    expect(patchResponse.status).toBe(400);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: "glossary_team_native_project_required",
    });
  });

  it("rejects changing source locale when attached projects use a different locale", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Locale Guard Team" });
    expect(teamResponse.status).toBe(201);
    const team = ((await teamResponse.json()) as TeamResponse).team;

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Locale Guard Project",
          teamId: team.id,
          sourceLocale: "en-US",
          targetLocales: ["es-ES"],
        },
      },
      { headers: adminHeaders },
    );
    expect(projectResponse.status).toBe(201);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const createResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Locale guard glossary",
          sourceLocale: "en-US",
          controlLevel: "org",
          projectIds: [project.id],
        },
      },
      { headers: adminHeaders },
    );
    expect(createResponse.status).toBe(201);
    const glossaryId = ((await createResponse.json()) as { glossary: { id: string } }).glossary.id;

    const patchResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].$patch(
      {
        param: { organizationSlug, glossaryId },
        json: { sourceLocale: "fr-FR" },
      },
      { headers: adminHeaders },
    );
    expect(patchResponse.status).toBe(400);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: "glossary_source_locale_attached_projects",
    });
  });

  it("patches and deletes concept-backed flat terms created via POST /terms", async () => {
    const admin = fixture.createWorkosIdentityWithRole("admin");
    const translator = fixture.createWorkosIdentityForOrganization(
      admin.organization,
      "translator",
    );
    const organizationSlug = admin.organization.slug ?? "missing-slug";
    const adminHeaders = await fixture.authHeadersFor(admin);
    const translatorHeaders = await fixture.authHeadersFor(translator);

    const teamResponse = await teamFixture.createTeamViaApi(admin, { name: "Flat CRUD Team" });
    expect(teamResponse.status).toBe(201);
    const team = ((await teamResponse.json()) as TeamResponse).team;

    await db.insert(schema.teamMemberships).values({
      teamId: team.id,
      userId: await fixture.getLocalUserId(translator.user.workosUserId),
      role: "member",
    });

    const projectResponse = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Flat CRUD Project",
          teamId: team.id,
          sourceLocale: "en-US",
          targetLocales: ["es-ES"],
        },
      },
      { headers: adminHeaders },
    );
    expect(projectResponse.status).toBe(201);
    const project = ((await projectResponse.json()) as ProjectResponse).project;

    const createGlossaryResponse = await client.api.orgs[":organizationSlug"].glossaries.$post(
      {
        param: { organizationSlug },
        json: {
          name: "Flat CRUD glossary",
          sourceLocale: "en-US",
          controlLevel: "team",
          projectIds: [project.id],
        },
      },
      { headers: translatorHeaders },
    );
    expect(createGlossaryResponse.status).toBe(201);
    const glossaryId = ((await createGlossaryResponse.json()) as { glossary: { id: string } })
      .glossary.id;

    const termResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms.$post(
      {
        param: { organizationSlug, glossaryId },
        json: {
          sourceTerm: "Cart",
          targetTerm: "Carrito",
          caseSensitive: false,
          forbidden: false,
        },
      },
      { headers: translatorHeaders },
    );
    expect(termResponse.status).toBe(201);
    const termId = ((await termResponse.json()) as { glossaryTerm: { id: string } }).glossaryTerm
      .id;

    const patchResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms[":termId"].$patch(
      {
        param: { organizationSlug, glossaryId, termId },
        json: { targetTerm: "Cesta" },
      },
      { headers: translatorHeaders },
    );
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      glossaryTerm: { sourceTerm: "Cart", targetTerm: "Cesta" },
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms[":termId"].$delete(
      {
        param: { organizationSlug, glossaryId, termId },
      },
      { headers: translatorHeaders },
    );
    expect(deleteResponse.status).toBe(204);
  });
});
