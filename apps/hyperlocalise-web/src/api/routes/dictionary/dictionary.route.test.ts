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
import type { AppType } from "@/api/typed-app";
import { db } from "@/lib/database/client";

import { createDictionaryTestFixture } from "./dictionary.fixture";

const client = testClient<AppType>(createApp());
const fixture = createDictionaryTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("dictionaryRoutes", () => {
  it("denies dictionary mutations for roles without dictionaries:write", async () => {
    for (const role of ["member", "developer", "translator", "reviewer"] as const) {
      const identity = fixture.createWorkosIdentityWithRole(role);
      const headers = await fixture.authHeadersFor(identity);

      const response = await client.api.orgs[":organizationSlug"].dictionaries.$post(
        {
          param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
          json: { name: "Unauthorized dictionary" },
        },
        { headers },
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
    }
  });

  it("creates a library, adds a word, attaches it once, and resolves the union", async () => {
    const { identity, organization, user, dictionary } =
      await fixture.createStoredDictionaryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const project = await fixture.createNativeProject(organization.id, user.id);

    const createWord = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].words.$post(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        json: { locale: "en-US", word: "Hyperlocalise" },
      },
      { headers },
    );
    expect(createWord.status).toBe(201);

    const secondLibrary = await client.api.orgs[":organizationSlug"].dictionaries.$post(
      {
        param: { organizationSlug },
        json: { name: "Secondary brands" },
      },
      { headers },
    );
    expect(secondLibrary.status).toBe(201);
    const secondary = (await secondLibrary.json()) as { dictionary: { id: string } };

    await client.api.orgs[":organizationSlug"].dictionaries[":dictionaryId"].words.$post(
      {
        param: { organizationSlug, dictionaryId: secondary.dictionary.id },
        json: { locale: "en-US", word: "hyperlocalise" },
      },
      { headers },
    );

    const attachPrimary = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].projects.$post(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        json: { projectId: project.id, priority: 0 },
      },
      { headers },
    );
    expect(attachPrimary.status).toBe(200);

    const attachAgain = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].projects.$post(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        json: { projectId: project.id, priority: 5 },
      },
      { headers },
    );
    expect(attachAgain.status).toBe(200);
    await expect(attachAgain.json()).resolves.toMatchObject({
      projects: [{ projectId: project.id, priority: 0 }],
    });

    await client.api.orgs[":organizationSlug"].dictionaries[":dictionaryId"].projects.$post(
      {
        param: { organizationSlug, dictionaryId: secondary.dictionary.id },
        json: { projectId: project.id, priority: 10 },
      },
      { headers },
    );

    const resolved = await client.api.orgs[":organizationSlug"].projects[":projectId"].dictionaries[
      "resolved"
    ].$get(
      {
        param: { organizationSlug, projectId: project.id },
        query: { locale: "en-US" },
      },
      { headers },
    );
    expect(resolved.status).toBe(200);
    await expect(resolved.json()).resolves.toMatchObject({
      locale: "en-US",
      words: ["Hyperlocalise"],
    });
  });

  it("imports only novel words and wraps the result in an import envelope", async () => {
    const { identity, dictionary } = await fixture.createStoredDictionaryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const createWord = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].words.$post(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        json: { locale: "en-US", word: "Hyperlocalise" },
      },
      { headers },
    );
    expect(createWord.status).toBe(201);

    const imported = await client.api.orgs[":organizationSlug"].dictionaries[":dictionaryId"].words[
      "import"
    ].$post(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        json: {
          locale: "en-us",
          content: "Hyperlocalise\nAuthKit\nZernio\n",
        },
      },
      { headers },
    );
    expect(imported.status).toBe(200);
    await expect(imported.json()).resolves.toEqual({
      import: { imported: 2, skipped: 1 },
    });

    const listed = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].words.$get(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        query: { locale: "en-US", limit: "1", offset: "0" },
      },
      { headers },
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      words: [{ word: "AuthKit" }],
      total: 3,
    });
  });

  it("canonicalizes locale tags and assigns sequential attach priorities", async () => {
    const { identity, organization, user, dictionary } =
      await fixture.createStoredDictionaryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const project = await fixture.createNativeProject(organization.id, user.id);

    const createWord = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].words.$post(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        json: { locale: "en_US", word: "Hyperlocalise" },
      },
      { headers },
    );
    expect(createWord.status).toBe(201);
    await expect(createWord.json()).resolves.toMatchObject({
      word: { locale: "en-US", word: "Hyperlocalise" },
    });

    const secondLibrary = await client.api.orgs[":organizationSlug"].dictionaries.$post(
      {
        param: { organizationSlug },
        json: { name: "Secondary brands" },
      },
      { headers },
    );
    expect(secondLibrary.status).toBe(201);
    const secondary = (await secondLibrary.json()) as { dictionary: { id: string } };

    const attachPrimary = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].projects.$post(
      {
        param: { organizationSlug, dictionaryId: dictionary.id },
        json: { projectId: project.id },
      },
      { headers },
    );
    expect(attachPrimary.status).toBe(200);
    await expect(attachPrimary.json()).resolves.toMatchObject({
      projects: [{ projectId: project.id, priority: 0 }],
    });

    const attachSecondary = await client.api.orgs[":organizationSlug"].dictionaries[
      ":dictionaryId"
    ].projects.$post(
      {
        param: { organizationSlug, dictionaryId: secondary.dictionary.id },
        json: { projectId: project.id },
      },
      { headers },
    );
    expect(attachSecondary.status).toBe(200);
    await expect(attachSecondary.json()).resolves.toMatchObject({
      projects: [{ projectId: project.id, priority: 1 }],
    });

    const resolved = await client.api.orgs[":organizationSlug"].projects[":projectId"].dictionaries[
      "resolved"
    ].$get(
      {
        param: { organizationSlug, projectId: project.id },
        query: { locale: "en-us" },
      },
      { headers },
    );
    expect(resolved.status).toBe(200);
    await expect(resolved.json()).resolves.toMatchObject({
      locale: "en-US",
      words: ["Hyperlocalise"],
    });
  });

  it("returns a dictionary envelope when attaching from the project route", async () => {
    const { identity, organization, user, dictionary } =
      await fixture.createStoredDictionaryFixture();
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const project = await fixture.createNativeProject(organization.id, user.id);

    const attach = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].dictionaries.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: { dictionaryId: dictionary.id },
      },
      { headers },
    );
    expect(attach.status).toBe(201);
    await expect(attach.json()).resolves.toMatchObject({
      dictionary: {
        id: dictionary.id,
        name: dictionary.name,
        priority: 0,
      },
    });

    const attachAgain = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].dictionaries.$post(
      {
        param: { organizationSlug, projectId: project.id },
        json: { dictionaryId: dictionary.id, priority: 9 },
      },
      { headers },
    );
    expect(attachAgain.status).toBe(200);
    await expect(attachAgain.json()).resolves.toMatchObject({
      dictionary: {
        id: dictionary.id,
        priority: 0,
      },
    });
  });
});
