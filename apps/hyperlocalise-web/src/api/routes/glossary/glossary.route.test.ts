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
import { db, schema } from "@/lib/database";

import { createGlossaryTestFixture } from "./glossary.fixture";

const client = testClient(createApp());
const fixture = createGlossaryTestFixture(client);

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

    const createResponse = await fixture.createGlossaryViaApi(identity);
    expect(createResponse.status).toBe(201);
    const createBody = (await createResponse.json()) as { glossary: { id: string } };

    const response = await client.api.orgs[":organizationSlug"].glossaries[
      ":glossaryId"
    ].terms.import.$post(
      {
        param: {
          organizationSlug,
          glossaryId: createBody.glossary.id,
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
    await expect(response.json()).resolves.toMatchObject({
      imported: 2,
      skipped: 1,
      glossaryTerms: [
        {
          sourceTerm: "CTA",
          targetTerm: "Llamada a la accion",
          description: "Button copy",
          partOfSpeech: "noun",
          forbidden: false,
          caseSensitive: false,
        },
        {
          sourceTerm: "Hero",
          targetTerm: "Heroe",
          description: "Homepage heading",
          partOfSpeech: "noun",
          forbidden: false,
          caseSensitive: false,
        },
      ],
    });
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
});
