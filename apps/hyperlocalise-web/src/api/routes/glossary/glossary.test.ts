import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";

import { createGlossaryTestFixture } from "./glossary.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
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

type GlossaryRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  name: string;
  description: string;
  sourceLocale: string;
  targetLocale: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type GlossaryResponse = {
  glossary: GlossaryRecord;
};

type GlossariesResponse = {
  glossaries: GlossaryRecord[];
};

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
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
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

    const body = (await response.json()) as GlossariesResponse;
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

    const body = (await response.json()) as GlossaryResponse;
    expect(body.glossary.id).toBeDefined();
    expect(body.glossary.name).toBe("Marketing Terms");
    expect(body.glossary.description).toBe("Marketing terminology list");
    expect(body.glossary.sourceLocale).toBe("en");
    expect(body.glossary.targetLocale).toBe("fr");
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

    const body = (await response.json()) as GlossaryResponse;
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
    await expect(response.json()).resolves.toEqual({
      error: "invalid_glossary_payload",
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
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });

  it("allows admin to create a glossary", async () => {
    const identity = createWorkosIdentityWithRole("admin");
    const response = await createGlossaryViaApi(identity, {
      name: "Admin Created Glossary",
    });

    expect(response.status).toBe(201);

    const body = (await response.json()) as GlossaryResponse;
    expect(body.glossary.name).toBe("Admin Created Glossary");
  });

  it("returns a glossary by id", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

    const response = await client.api.glossary[":glossaryId"].$get(
      {
        param: { glossaryId: createdBody.glossary.id },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as GlossaryResponse;
    expect(body.glossary.id).toBe(createdBody.glossary.id);
    expect(body.glossary.name).toBe("Marketing Glossary");
  });

  it("updates an existing glossary", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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

    const body = (await response.json()) as GlossaryResponse;
    expect(body.glossary.id).toBe(createdBody.glossary.id);
    expect(body.glossary.name).toBe("Updated Glossary Name");
  });

  it("returns 400 for invalid patch payloads", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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
    await expect(emptyResponse.json()).resolves.toEqual({
      error: "invalid_glossary_payload",
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
    await expect(invalidNameResponse.json()).resolves.toEqual({
      error: "invalid_glossary_payload",
    });
  });

  it("returns 404 when another organization fetches a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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
    await expect(response.json()).resolves.toEqual({
      error: "glossary_not_found",
    });
  });

  it("returns 404 when another organization updates a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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
    await expect(response.json()).resolves.toEqual({
      error: "glossary_not_found",
    });
  });

  it("returns 403 when a member updates a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
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
    await expect(response.json()).resolves.toEqual({
      error: "glossary_not_found",
    });
  });

  it("deletes an existing glossary", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(identity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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
    await expect(response.json()).resolves.toEqual({
      error: "glossary_not_found",
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
    await expect(response.json()).resolves.toEqual({
      error: "glossary_not_found",
    });
  });

  it("returns 403 when a member deletes a glossary", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createGlossaryViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as GlossaryResponse;

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
    await expect(response.json()).resolves.toEqual({
      error: "forbidden",
    });
  });
});
