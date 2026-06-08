import "dotenv/config";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";
import { getTmsProviderLiveCatFile, saveTmsProviderLiveCatTranslation } from "./tms-provider-live";

const fixture = createAuthTestFixture();

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

  it("aggregates Crowdin strings, target translations, approvals, and unresolved comments", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: organization.id,
      userId: user.id,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "token",
      baseUrl: "https://api.crowdin.test/api/v2",
    });

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.includes("/projects?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 42,
                  name: "Website",
                  identifier: "website",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["fr"],
                  webUrl: "https://crowdin.test/project/website",
                  isSuspended: false,
                },
              },
            ],
          }),
          { status: 200 },
        );
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

      if (path.includes("/projects/42/approvals?") && path.includes("languageId=fr")) {
        return new Response(
          JSON.stringify({
            data: [{ data: { id: 1, translationId: 9001, stringId: 1001, languageId: "fr" } }],
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/projects/42/comments?") &&
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

      if (path.includes("/projects/42/comments?") && path.includes("type=issue")) {
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
      target: { text: "Bonjour", externalTranslationId: "9001", isApproved: true },
      comments: [{ externalCommentId: "501", type: "comment" }],
    });
    expect(catFile?.segments[1]).toMatchObject({
      externalStringId: "1002",
      sourceText: JSON.stringify({ one: "Start", other: "Start all" }),
      target: null,
      comments: [{ externalCommentId: "502", type: "issue", status: "unresolved" }],
    });
    const requestedPaths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(
      requestedPaths.some(
        (path) =>
          path.includes("/projects/42/comments?") &&
          path.includes("type=comment") &&
          path.includes("languageId=fr"),
      ),
    ).toBe(true);
    expect(
      requestedPaths.some(
        (path) =>
          path.includes("/projects/42/comments?") &&
          path.includes("type=issue") &&
          path.includes("languageId=fr") &&
          path.includes("issueStatus=unresolved"),
      ),
    ).toBe(true);
  });

  it("saves a Crowdin CAT translation without listing project approvals", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity(
      fixture.createWorkosIdentityWithRole("admin"),
    );
    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: organization.id,
      userId: user.id,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "token",
      baseUrl: "https://api.crowdin.test/api/v2",
    });

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.includes("/projects?")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                data: {
                  id: 42,
                  name: "Website",
                  identifier: "website",
                  sourceLanguageId: "en",
                  targetLanguageIds: ["fr"],
                  webUrl: "https://crowdin.test/project/website",
                  isSuspended: false,
                },
              },
            ],
          }),
          { status: 200 },
        );
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
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      if (path.includes("/projects/42/translations") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: 9001,
              stringId: 1001,
              languageId: "fr",
              text: "Bonjour",
              createdAt: "2026-06-08T00:00:00Z",
            },
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
        text: "Bonjour",
      },
    );

    expect(translation).toEqual({
      text: "Bonjour",
      externalTranslationId: "9001",
      isApproved: false,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/approvals?"))).toBe(false);
  });
});
