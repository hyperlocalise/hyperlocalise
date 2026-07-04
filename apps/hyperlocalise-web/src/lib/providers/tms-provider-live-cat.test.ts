import "dotenv/config";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";
import { upsertCrowdinUserPatConnection } from "@/lib/providers/adapters/crowdin/crowdin-user-connections";
import { isErr } from "@/lib/primitives/result/results";
import { upsertCrowdinPatProviderCredential } from "./organization-external-tms-provider-credentials";
import {
  getTmsProviderLiveCatFile,
  getTmsProviderLiveCatSegmentComments,
  getTmsProviderLiveCatSegmentTarget,
  saveTmsProviderLiveCatTranslation,
} from "./tms-provider-live";

const fixture = createAuthTestFixture();

async function setupCrowdinPatCredential(input: {
  organizationId: string;
  userId: string;
  baseUrl?: string;
}) {
  const credential = await upsertCrowdinPatProviderCredential({
    organizationId: input.organizationId,
    userId: input.userId,
    role: "admin",
    displayName: "Crowdin",
    baseUrl: input.baseUrl ?? "https://api.crowdin.test/api/v2",
  });

  const connectionResult = await upsertCrowdinUserPatConnection({
    organizationId: input.organizationId,
    userId: input.userId,
    providerCredentialId: credential.id,
    personalAccessToken: "token",
    crowdinUser: {
      id: 1,
      username: "crowdin-test-user",
      email: "crowdin-test-user@example.com",
      fullName: "Crowdin Test User",
    },
  });

  if (isErr(connectionResult)) {
    throw new Error(`Failed to set up Crowdin PAT connection: ${connectionResult.error.code}`);
  }

  return credential;
}

function isCrowdinGetProjectRequest(path: string): boolean {
  return /\/projects\/42(?:\?|$)/.test(path);
}

function mockCrowdinProject42Response(): Response {
  return new Response(
    JSON.stringify({
      data: {
        id: 42,
        name: "Website",
        identifier: "website",
        sourceLanguageId: "en",
        targetLanguageIds: ["fr"],
        webUrl: "https://crowdin.test/project/website",
        isSuspended: false,
      },
    }),
    { status: 200 },
  );
}

describe("getTmsProviderLiveCatFile", () => {
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("loads Crowdin queue segments with translations without approval or comment API calls", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/files/101/revisions?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 7,
                  fileId: 101,
                  projectId: 42,
                  info: {
                    sourceLanguageId: "en",
                    addedStrings: 2,
                    removedStrings: 0,
                    updatedStrings: 0,
                  },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/strings?") && path.includes("fileId=101")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1001,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "hero.title",
                  text: "Hello",
                  type: "text",
                  context: "Hero",
                  labelIds: null,
                },
              },
              {
                data: {
                  id: 1002,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "hero.cta",
                  text: { one: "Start", other: "Start all" },
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/strings?") &&
        path.includes("croql=") &&
        path.includes("has+unresolved+issue")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1002,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "hero.cta",
                  text: { one: "Start", other: "Start all" },
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/languages/fr/translations?") &&
        path.includes("stringIds=1001%2C1002")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9001,
                  text: "Bonjour",
                  createdAt: "2026-06-08T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/approvals?") &&
        path.includes("languageId=fr") &&
        path.includes("fileId=101")
      ) {
        return new Response(
          JSON.stringify({
            data: [{ data: { id: 1, translationId: 9001, stringId: 1001, languageId: "fr" } }],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/comments?") &&
        path.includes("stringId=1001") &&
        path.includes("type=comment") &&
        init?.method !== "POST"
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 501,
                  text: "Check product wording",
                  userId: 1,
                  stringId: 1001,
                  languageId: "fr",
                  type: "comment",
                  createdAt: "2026-06-08T00:01:00Z",
                  projectId: 42,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/comments?") &&
        path.includes("stringId=1002") &&
        path.includes("type=issue")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 502,
                  text: "Missing CTA translation",
                  userId: 1,
                  stringId: 1002,
                  languageId: "fr",
                  type: "issue",
                  issueStatus: "unresolved",
                  createdAt: "2026-06-08T00:02:00Z",
                  projectId: 42,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await getTmsProviderLiveCatFile(organization.id, "42", "home.json", "fr", {
      actorUserId: user.id,
      canEditTranslations: true,
    });

    expect(catFile).toMatchObject({
      sourcePath: "home.json",
      targetLocale: "fr",
      canEditTranslations: true,
      truncated: false,
    });
    expect(catFile?.provider?.targetLocales).toEqual(["fr"]);
    expect(catFile?.segments).toHaveLength(2);
    expect(catFile?.segments[0]).toMatchObject({
      externalStringId: "1001",
      key: "hero.title",
      sourceText: "Hello",
      comments: [],
    });
    expect(catFile?.segments[0]).not.toHaveProperty("target");
    expect(catFile?.segments[1]).toMatchObject({
      externalStringId: "1002",
      sourceText: JSON.stringify({ one: "Start", other: "Start all" }),
      comments: [],
    });
    expect(catFile?.segments[1]).not.toHaveProperty("target");
    const requestedPaths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedPaths.some((path) => path.includes("/projects/42/approvals?"))).toBe(false);
    expect(
      requestedPaths.some(
        (path) =>
          path.includes("/projects/42/comments?") &&
          path.includes("stringId=1001") &&
          path.includes("type=comment"),
      ),
    ).toBe(false);
  });

  it("loads Crowdin queue segments without translation or approval lookups", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/files/101/revisions?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/strings?") && path.includes("fileId=101")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1001,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "hero.title",
                  text: "Hello",
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/languages/fr/translations?") &&
        path.includes("stringIds=1001")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9001,
                  text: "Bonjour",
                  createdAt: "2026-06-08T00:00:00Z",
                },
              },
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9002,
                  text: "Salut",
                  createdAt: "2026-06-09T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/approvals?") &&
        path.includes("languageId=fr") &&
        path.includes("fileId=101")
      ) {
        return new Response(
          JSON.stringify({
            data: [{ data: { id: 1, translationId: 9001, stringId: 1001, languageId: "fr" } }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await getTmsProviderLiveCatFile(organization.id, "42", "home.json", "fr", {
      actorUserId: user.id,
      canEditTranslations: true,
    });

    expect(catFile?.segments[0]).toMatchObject({
      externalStringId: "1001",
      key: "hero.title",
      sourceText: "Hello",
      comments: [],
    });
    expect(catFile?.segments[0]).not.toHaveProperty("target");
    const requestedPaths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedPaths.some((path) => path.includes("/projects/42/approvals?"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/languages/fr/translations?"))).toBe(false);
  });

  it("loads a Crowdin queue directly by provider resource id", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/projects/42/strings?") && path.includes("fileId=101")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1001,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "hero.title",
                  text: "Hello",
                  type: "text",
                  context: "Hero",
                  labelIds: null,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/languages/fr/translations?") &&
        path.includes("stringIds=1001")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9001,
                  text: "Bonjour",
                  createdAt: "2026-06-08T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await getTmsProviderLiveCatFile(organization.id, "42", "home.json", "fr", {
      actorUserId: user.id,
      canEditTranslations: true,
      externalResourceId: "101",
      resourceType: "file",
    });

    expect(catFile?.segments).toHaveLength(1);
    expect(catFile?.segments[0]).toMatchObject({
      externalStringId: "1001",
      key: "hero.title",
      sourceText: "Hello",
      comments: [],
    });
    expect(catFile?.segments[0]).not.toHaveProperty("target");
    const requestedPaths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedPaths.some((path) => path.includes("/branches?"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/directories?"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/files?"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/approvals?"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/languages/fr/translations?"))).toBe(false);
  });

  it("saves a Crowdin CAT translation against the approved record when suggestions exist", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    let approvalRequestCount = 0;
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/files/101/revisions?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (
        path.includes("/projects/42/languages/fr/translations?") &&
        path.includes("stringIds=1001")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9001,
                  text: "Bonjour",
                  createdAt: "2026-06-08T00:00:00Z",
                },
              },
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9002,
                  text: "Salut",
                  createdAt: "2026-06-09T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/approvals?") &&
        path.includes("languageId=fr") &&
        path.includes("fileId=101")
      ) {
        approvalRequestCount += 1;
        return new Response(
          JSON.stringify({
            data:
              approvalRequestCount === 1
                ? [{ data: { id: 1, translationId: 9001, stringId: 1001, languageId: "fr" } }]
                : [],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/translations") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9010,
                  stringId: 1001,
                  languageId: "fr",
                  text: "Bonjour amélioré",
                  createdAt: "2026-06-08T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const translation = await saveTmsProviderLiveCatTranslation(
      organization.id,
      "42",
      "home.json",
      {
        targetLocale: "fr",
        externalStringId: "1001",
        text: "Bonjour amélioré",
      },
      { actorUserId: user.id },
    );

    expect(translation).toEqual({
      text: "Bonjour amélioré",
      externalTranslationId: "9010",
      isApproved: false,
    });
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/projects/42/translations") && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual([
      { op: "remove", path: "/9001" },
      {
        op: "add",
        path: "/-",
        value: {
          stringId: 1001,
          languageId: "fr",
          text: "Bonjour amélioré",
        },
      },
    ]);
    expect(approvalRequestCount).toBe(1);
  });

  it("updates an existing unapproved Crowdin CAT translation in place", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/files/101/revisions?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (
        path.includes("/projects/42/languages/fr/translations?") &&
        path.includes("stringIds=1001")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9002,
                  text: "Salut",
                  createdAt: "2026-06-09T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/approvals?") &&
        path.includes("languageId=fr") &&
        path.includes("fileId=101")
      ) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/translations") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 9002,
                  stringId: 1001,
                  languageId: "fr",
                  text: "Bonjour amélioré",
                  createdAt: "2026-06-09T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const translation = await saveTmsProviderLiveCatTranslation(
      organization.id,
      "42",
      "home.json",
      {
        targetLocale: "fr",
        externalStringId: "1001",
        text: "Bonjour amélioré",
      },
      { actorUserId: user.id },
    );

    expect(translation).toEqual({
      text: "Bonjour amélioré",
      externalTranslationId: "9002",
      isApproved: false,
    });
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/projects/42/translations") && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual([
      { op: "replace", path: "/9002/text", value: "Bonjour amélioré" },
    ]);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/projects/42/translations") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("loads paginated Crowdin queue pages without walking the full file for totals", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const stringPage = (offset: number, limit: number) =>
      Array.from({ length: limit }, (_, index) => ({
        data: {
          id: offset + index + 1,
          projectId: 42,
          fileId: 101,
          branchId: null,
          directoryId: null,
          identifier: `key.${offset + index + 1}`,
          text: `Value ${offset + index + 1}`,
          type: "text",
          context: null,
          labelIds: null,
        },
      }));

    let stringsRequestCount = 0;
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/files/101/revisions?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/strings?") && path.includes("fileId=101")) {
        stringsRequestCount += 1;
        const params = new URL(path).searchParams;
        const offset = Number(params.get("offset") ?? "0");
        const limit = Number(params.get("limit") ?? "500");
        expect(limit).toBeLessThanOrEqual(500);
        return new Response(JSON.stringify({ data: stringPage(offset, limit) }), { status: 200 });
      }

      if (path.includes("/projects/42/strings?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await getTmsProviderLiveCatFile(organization.id, "42", "home.json", "fr", {
      actorUserId: user.id,
      canEditTranslations: true,
      pagination: {
        offset: 0,
        limit: 50,
        paginated: true,
      },
    });

    expect(catFile?.pagination).toMatchObject({
      offset: 0,
      limit: 50,
      returnedCount: 50,
      totalCount: 51,
      hasMore: true,
    });
    expect(stringsRequestCount).toBe(1);
  });

  it("uses CroQL for paginated Crowdin file search and omits fileId", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const stringsRequests: URL[] = [];
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/files/101/revisions?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/strings?")) {
        const requestUrl = new URL(path);
        stringsRequests.push(requestUrl);
        const croql = requestUrl.searchParams.get("croql");
        if (croql?.includes("hero")) {
          expect(croql).toBe(
            'id of file = 101 and (identifier contains "hero" or text contains "hero")',
          );
          expect(requestUrl.searchParams.has("fileId")).toBe(false);
        }

        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1001,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "homepage.hero.title",
                  text: "Hero title",
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
              {
                data: {
                  id: 1002,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "homepage.hero.cta",
                  text: "Hero CTA",
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await getTmsProviderLiveCatFile(organization.id, "42", "home.json", "fr", {
      actorUserId: user.id,
      canEditTranslations: true,
      pagination: {
        offset: 0,
        limit: 25,
        paginated: true,
        search: "hero",
      },
    });

    expect(catFile?.pagination).toMatchObject({
      offset: 0,
      limit: 25,
      returnedCount: 2,
      totalCount: 2,
      hasMore: false,
    });
    expect(stringsRequests.length).toBe(1);
  });

  it("marks every visible has_issues segment with unresolved issue flags without per-string comment calls", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const issueCommentRequests: string[] = [];
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/files/101/revisions?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (
        path.includes("/projects/42/strings?") &&
        path.includes("croql=") &&
        path.includes("has+unresolved+issue")
      ) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 1001,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "homepage.hero.title",
                  text: "Hero title",
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
              {
                data: {
                  id: 1002,
                  projectId: 42,
                  fileId: 101,
                  branchId: null,
                  directoryId: null,
                  identifier: "homepage.hero.cta",
                  text: "Hero CTA",
                  type: "text",
                  context: null,
                  labelIds: null,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/languages/fr/translations?") &&
        path.includes("stringIds=1001%2C1002")
      ) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (
        path.includes("/projects/42/approvals?") &&
        path.includes("languageId=fr") &&
        path.includes("fileId=101")
      ) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/comments?") && path.includes("type=issue")) {
        const requestUrl = new URL(path);
        const stringId = requestUrl.searchParams.get("stringId");
        if (stringId) {
          issueCommentRequests.push(stringId);
        }

        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: Number(`50${stringId}`),
                  text: `Issue on ${stringId}`,
                  userId: 1,
                  stringId: Number(stringId),
                  languageId: "fr",
                  type: "issue",
                  issueStatus: "unresolved",
                  createdAt: "2026-06-08T00:02:00Z",
                  projectId: 42,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const catFile = await getTmsProviderLiveCatFile(organization.id, "42", "home.json", "fr", {
      actorUserId: user.id,
      canEditTranslations: true,
      pagination: {
        offset: 0,
        limit: 25,
        paginated: true,
        queueFilter: "has_issues",
      },
    });

    expect(catFile?.pagination).toMatchObject({
      offset: 0,
      limit: 25,
      returnedCount: 2,
      totalCount: 2,
      hasMore: false,
    });
    expect(catFile?.segments).toHaveLength(2);
    expect(catFile?.segments.every((segment) => segment.unresolvedIssueCount === 1)).toBe(true);
    expect(issueCommentRequests).toEqual([]);
  });
});

describe("getTmsProviderLiveCatSegmentTarget", () => {
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("scopes Crowdin comments and unresolved issues to the requested target locale", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await setupCrowdinPatCredential({
      organizationId: organization.id,
      userId: user.id,
    });

    const commentRequests: string[] = [];
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (isCrowdinGetProjectRequest(path)) {
        return mockCrowdinProject42Response();
      }

      if (path.includes("/projects/42/branches?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/directories?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/files?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 101,
                  branchId: null,
                  directoryId: null,
                  name: "home.json",
                  title: "home.json",
                  type: "json",
                  path: "/home.json",
                  status: "active",
                  revisionId: 7,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/42/strings/1001")) {
        return new Response(
          JSON.stringify({
            data: {
              id: 1001,
              projectId: 42,
              fileId: 101,
              branchId: null,
              directoryId: null,
              identifier: "hero.title",
              text: "Hello",
              type: "text",
              context: "Hero",
              labelIds: null,
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/languages/fr/translations?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  stringId: 1001,
                  contentType: "text",
                  translationId: 9001,
                  text: "Bonjour",
                  createdAt: "2026-06-08T00:00:00Z",
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/projects/42/approvals?") && path.includes("stringId=1001")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/comments?")) {
        commentRequests.push(path);

        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 501,
                  text: "French note",
                  userId: 1,
                  stringId: 1001,
                  languageId: "fr",
                  type: "comment",
                  createdAt: "2026-06-08T00:01:00Z",
                  projectId: 42,
                },
              },
              {
                data: {
                  id: 502,
                  text: "German note",
                  userId: 1,
                  stringId: 1001,
                  languageId: "de",
                  type: "comment",
                  createdAt: "2026-06-08T00:02:00Z",
                  projectId: 42,
                },
              },
              {
                data: {
                  id: 601,
                  text: "French issue",
                  userId: 1,
                  stringId: 1001,
                  languageId: "fr",
                  type: "issue",
                  issueStatus: "unresolved",
                  createdAt: "2026-06-08T00:03:00Z",
                  projectId: 42,
                },
              },
              {
                data: {
                  id: 602,
                  text: "German issue",
                  userId: 1,
                  stringId: 1001,
                  languageId: "de",
                  type: "issue",
                  issueStatus: "unresolved",
                  createdAt: "2026-06-08T00:04:00Z",
                  projectId: 42,
                },
              },
              {
                data: {
                  id: 603,
                  text: "Resolved French issue",
                  userId: 1,
                  stringId: 1001,
                  languageId: "fr",
                  type: "issue",
                  issueStatus: "resolved",
                  createdAt: "2026-06-08T00:05:00Z",
                  projectId: 42,
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const target = await getTmsProviderLiveCatSegmentTarget(
      organization.id,
      "42",
      "home.json",
      "fr",
      "1001",
      { actorUserId: user.id, externalResourceId: "101", resourceType: "file" },
    );

    expect(target).toMatchObject({
      text: "Bonjour",
      externalTranslationId: "9001",
      isApproved: false,
    });

    const comments = await getTmsProviderLiveCatSegmentComments(
      organization.id,
      "42",
      "home.json",
      "fr",
      "1001",
      { actorUserId: user.id, externalResourceId: "101", resourceType: "file" },
    );

    expect(comments).toHaveLength(2);
    expect(comments.map((comment) => comment.locale)).toEqual(["fr", "fr"]);
    expect(comments.map((comment) => comment.text)).toEqual(["French issue", "French note"]);
    expect(commentRequests).toHaveLength(1);
    for (const path of commentRequests) {
      expect(path).toContain("targetLanguageId=fr");
      expect(path).toContain("stringId=1001");
      expect(path).not.toContain("type=");
    }
    const requestedPaths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedPaths.some((path) => path.endsWith("/projects/42/strings/1001"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/branches?"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/directories?"))).toBe(false);
    expect(requestedPaths.some((path) => path.includes("/files?"))).toBe(false);
  });
});
