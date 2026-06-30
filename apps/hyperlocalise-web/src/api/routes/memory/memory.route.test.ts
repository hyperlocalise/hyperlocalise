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
import { db } from "@/lib/database";

import { createMemoryTestFixture } from "./memory.fixture";

const client = testClient(createApp());
const fixture = createMemoryTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("memoryRoutes", () => {
  it("imports CSV memory entries with quoted multiline cells and clamps match scores", async () => {
    const { identity, memory } = await fixture.createStoredMemoryFixture();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.import.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          format: "csv",
          content: [
            "sourceLocale,targetLocale,sourceText,targetText,score",
            'en,es,"Tap, hold","Mantener\npulsado",150',
            'en,fr,"Line one\nline two","Ligne ""citee""",-15',
          ].join("\r\n"),
        },
      },
      { headers },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      imported: number;
      skipped: number;
      memoryEntries: Array<{
        sourceLocale: string;
        targetLocale: string;
        sourceText: string;
        targetText: string;
        matchScore: number;
      }>;
    };
    expect(body).toMatchObject({
      imported: 2,
      skipped: 0,
    });
    expect(body.memoryEntries).toEqual([
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "es",
        sourceText: "Tap, hold",
        targetText: "Mantener\npulsado",
        matchScore: 100,
      }),
      expect.objectContaining({
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Line one\nline two",
        targetText: 'Ligne "citee"',
        matchScore: 0,
      }),
    ]);
  });
});
