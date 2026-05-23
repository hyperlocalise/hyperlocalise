import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";
import { upsertOrganizationExternalTmsGlossary } from "@/lib/providers/organization-external-tms-glossaries";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";

import { createGlossaryTestFixture } from "./glossary.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

function generateNonExistentUuid(): string {
  return randomUUID();
}

const client = testClient(app);
const glossaryFixture = createGlossaryTestFixture(client);
const { authHeadersFor, createGlossaryViaApi, createWorkosIdentity, createWorkosIdentityWithRole } =
  glossaryFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await glossaryFixture.cleanup();
});

describe("glossaryRoutes", () => {
  it("returns 401 when auth context is missing", async () => {
    const response = await client.api.glossary.$get({ query: { limit: "50", offset: "0" } });

    expect(response.status).toBe(401);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
  });

  it("keeps glossary routes mounted at legacy and org-scoped app paths", async () => {
    const identity = createWorkosIdentity();
    await createGlossaryViaApi(identity, { name: "Mounted Glossary" });
    const headers = await authHeadersFor(identity);

    const legacyResponse = await client.api.glossary.$get(
      { query: { limit: "50", offset: "0" } },
      { headers },
    );
    expect(legacyResponse.status).toBe(200);
    await expect(legacyResponse.json()).resolves.toMatchObject({
      glossaries: [expect.objectContaining({ name: "Mounted Glossary" })],
    });

    const orgScopedResponse = await client.api.orgs[":organizationSlug"].glossaries.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );

    expect(orgScopedResponse.status).toBe(200);
    await expect(orgScopedResponse.json()).resolves.toMatchObject({
      glossaries: [expect.objectContaining({ name: "Mounted Glossary" })],
    });
  });

  it("lists glossaries for the current organization", async () => {
    const identity = createWorkosIdentity();
    await createGlossaryViaApi(identity, { name: "Glossary One" });
    await createGlossaryViaApi(identity, { name: "Glossary Two" });

    const otherIdentity = createWorkosIdentity();
    await createGlossaryViaApi(otherIdentity, { name: "Other Org Glossary" });

    const response = await client.api.glossary.$get(
      { query: { limit: "50", offset: "0" } },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.glossaries).toHaveLength(2);
    expect(body.glossaries.map((glossary) => glossary.name)).toEqual([
      "Glossary Two",
      "Glossary One",
    ]);
  });

  it("creates a glossary with validated input", async () => {
    const identity = createWorkosIdentity();
    const response = await createGlossaryViaApi(identity, {
      name: "Marketing Terms",
      description: "Marketing terminology list",
      sourceLocale: "en",
      targetLocale: "fr",
    });

    expect(response.status).toBe(201);

    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.glossary.id).toBeDefined();
    expect(body.glossary.name).toBe("Marketing Terms");
    expect(body.glossary.description).toBe("Marketing terminology list");
    expect(body.glossary.sourceLocale).toBe("en");
    expect(body.glossary.targetLocale).toBe("fr");
    expect(body.glossary.source).toBe("native");
    expect(body.glossary.externalProviderKind).toBeNull();
  });

  it("fills default values for optional create fields", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.glossary.$post(
      {
        json: {
          name: "Test Glossary",
          sourceLocale: "en",
          targetLocale: "es",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(201);

    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.glossary.name).toBe("Test Glossary");
    expect(body.glossary.description).toBe("");
  });

  it("returns 400 for invalid create payloads", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.glossary.$post(
      {
        json: {
          name: "   ",
          sourceLocale: "en",
          targetLocale: "es",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "invalid_glossary_payload",
      message: expect.any(String),
    });
  });

  it("returns 403 when a member creates a glossary", async () => {
    const identity = createWorkosIdentityWithRole("member");
    const response = await client.api.glossary.$post(
      {
        json: {
          name: "Test Glossary",
          sourceLocale: "en",
          targetLocale: "es",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("allows admin to create a glossary", async () => {
    const identity = createWorkosIdentityWithRole("admin");
    const response = await createGlossaryViaApi(identity, {
      name: "Admin Created Glossary",
    });

    expect(response.status).toBe(201);

    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.glossary.name).toBe("Admin Created Glossary");
  });

  it("returns a glossary by id", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const response = await client.api.glossary[":glossaryId"].$get(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.glossary.id).toBe(createdBody.glossary.id);
    expect(body.glossary.name).toBe("Marketing Glossary");
  });

  it("updates an existing glossary", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const response = await client.api.glossary[":glossaryId"].$patch(
      {
        param: { glossaryId: createdBody.glossary.id },
        json: {
          name: "Updated Glossary Name",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.glossary.id).toBe(createdBody.glossary.id);
    expect(body.glossary.name).toBe("Updated Glossary Name");
  });

  it("returns 400 for invalid patch payloads", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const emptyResponse = await client.api.glossary[":glossaryId"].$patch(
      {
        param: { glossaryId: createdBody.glossary.id },
        json: {},
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(emptyResponse.status).toBe(400);
    const emptyResponseBody = await emptyResponse.json();
    expect(emptyResponseBody).toMatchObject({
      error: "invalid_glossary_payload",
      message: expect.any(String),
    });

    const invalidNameResponse = await client.api.glossary[":glossaryId"].$patch(
      {
        param: { glossaryId: createdBody.glossary.id },
        json: {
          name: "   ",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(invalidNameResponse.status).toBe(400);
    const invalidNameResponseBody = await invalidNameResponse.json();
    expect(invalidNameResponseBody).toMatchObject({
      error: "invalid_glossary_payload",
      message: expect.any(String),
    });
  });

  it("returns 404 when another organization fetches a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.glossary[":glossaryId"].$get(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "glossary_not_found",
      message: expect.any(String),
    });
  });

  it("returns 404 when another organization updates a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.glossary[":glossaryId"].$patch(
      {
        param: { glossaryId: createdBody.glossary.id },
        json: {
          name: "Should Not Apply",
        },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "glossary_not_found",
      message: expect.any(String),
    });
  });

  it("returns 403 when a member updates a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const memberIdentity = createWorkosIdentityWithRole("member");
    const response = await client.api.glossary[":glossaryId"].$patch(
      {
        param: { glossaryId: createdBody.glossary.id },
        json: {
          name: "Should Not Apply",
        },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("returns 404 when a glossary does not exist", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.glossary[":glossaryId"].$get(
      {
        param: { glossaryId: generateNonExistentUuid() },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "glossary_not_found",
      message: expect.any(String),
    });
  });

  it("deletes an existing glossary", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const response = await client.api.glossary[":glossaryId"].$delete(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(204);

    const fetchResponse = await client.api.glossary[":glossaryId"].$get(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(fetchResponse.status).toBe(404);
  });

  it("returns 404 when another organization deletes a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.glossary[":glossaryId"].$delete(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "glossary_not_found",
      message: expect.any(String),
    });

    const fetchResponse = await client.api.glossary[":glossaryId"].$get(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(ownerIdentity),
      },
    );

    expect(fetchResponse.status).toBe(200);
  });

  it("returns 404 when deleting a glossary that does not exist", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.glossary[":glossaryId"].$delete(
      {
        param: { glossaryId: generateNonExistentUuid() },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "glossary_not_found",
      message: expect.any(String),
    });
  });

  it("returns 403 when a member deletes a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = await createdResponse.json();
    if ("error" in createdBody) throw new Error(String(createdBody.error));

    const memberIdentity = createWorkosIdentityWithRole("member");
    const response = await client.api.glossary[":glossaryId"].$delete(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("lists native and provider-backed glossaries together", async () => {
    const identity = createWorkosIdentity();
    const { organization, user } = await glossaryFixture.createLocalWorkosIdentity(identity);
    await createGlossaryViaApi(identity, { name: "Native Glossary" });

    const organizationId = organization.id;
    const userId = user.id;
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-token",
    });

    await upsertOrganizationExternalTmsGlossary({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      externalResourceType: "term_base",
      externalGlossaryId: "tb-42",
      name: "Phrase Term Base",
      sourceLocale: "en",
      targetLocale: "fr",
      externalUrl: "https://phrase.com/term-bases/tb-42",
    });

    const response = await client.api.glossary.$get(
      { query: { limit: "50", offset: "0" } },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));

    expect(body.glossaries).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.glossaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Native Glossary", source: "native" }),
        expect.objectContaining({
          name: "Phrase Term Base",
          source: "external_tms",
          externalProviderKind: "phrase",
          externalResourceType: "term_base",
          externalGlossaryId: "tb-42",
          externalUrl: "https://phrase.com/term-bases/tb-42",
        }),
      ]),
    );
  });

  it("filters glossaries by search and source on the server", async () => {
    const identity = createWorkosIdentity();
    const { organization, user } = await glossaryFixture.createLocalWorkosIdentity(identity);
    await createGlossaryViaApi(identity, { name: "Workspace Marketing Terms" });

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-token",
    });

    await upsertOrganizationExternalTmsGlossary({
      organizationId: organization.id,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-9",
      externalResourceType: "glossary",
      externalGlossaryId: "glossary-9",
      name: "Crowdin Product Glossary",
      sourceLocale: "en",
      targetLocale: "de",
    });

    const headers = await authHeadersFor(identity);

    const searchResponse = await client.api.glossary.$get(
      { query: { limit: "50", offset: "0", search: "marketing" } },
      { headers },
    );
    expect(searchResponse.status).toBe(200);
    const searchBody = await searchResponse.json();
    if ("error" in searchBody) throw new Error(String(searchBody.error));
    expect(searchBody.total).toBe(1);
    expect(searchBody.glossaries).toEqual([
      expect.objectContaining({ name: "Workspace Marketing Terms" }),
    ]);

    const providerResponse = await client.api.glossary.$get(
      { query: { limit: "50", offset: "0", source: "external_tms" } },
      { headers },
    );
    expect(providerResponse.status).toBe(200);
    const providerBody = await providerResponse.json();
    if ("error" in providerBody) throw new Error(String(providerBody.error));
    expect(providerBody.total).toBe(1);
    expect(providerBody.glossaries).toEqual([
      expect.objectContaining({ name: "Crowdin Product Glossary", source: "external_tms" }),
    ]);
  });

  it("forbids mutating provider-backed glossaries", async () => {
    const identity = createWorkosIdentity();
    const { organization, user } = await glossaryFixture.createLocalWorkosIdentity(identity);
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-token",
    });

    const externalGlossary = await upsertOrganizationExternalTmsGlossary({
      organizationId: organization.id,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      externalResourceType: "glossary",
      externalGlossaryId: "glossary-99",
      name: "Crowdin Glossary",
      sourceLocale: "en",
      targetLocale: "fr",
    });

    const headers = await authHeadersFor(identity);

    const patchResponse = await client.api.glossary[":glossaryId"].$patch(
      {
        param: { glossaryId: externalGlossary.id },
        json: { name: "Renamed" },
      },
      { headers },
    );
    expect(patchResponse.status).toBe(403);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: "external_tms_glossary_immutable",
    });

    const deleteResponse = await client.api.glossary[":glossaryId"].$delete(
      {
        param: { glossaryId: externalGlossary.id },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(403);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      error: "external_tms_glossary_immutable",
    });
  });
});
