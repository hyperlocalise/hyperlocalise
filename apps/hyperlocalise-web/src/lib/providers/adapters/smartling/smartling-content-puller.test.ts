import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pullSmartlingTaskContent } from "./smartling-content-puller";

describe("pullSmartlingTaskContent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("pulls job-scoped source strings and locale translations", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);

      if (path.endsWith("/authenticate") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/proj-1/jobs/job-1") && init?.method !== "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                translationJobUid: "job-1",
                jobName: "French rollout",
                jobStatus: "in_progress",
                targetLocaleIds: ["fr-FR"],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/projects/proj-1") && !path.includes("/jobs/")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                projectId: "proj-1",
                projectName: "Demo",
                sourceLocaleId: "en-US",
                accountUid: "acct-1",
                targetLocales: [{ localeId: "fr-FR", enabled: true }],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/jobs/job-1/files")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ fileUri: "messages.json" }],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/source-strings")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    hashcode: "hash-1",
                    stringText: "Hello",
                    fileUri: "messages.json",
                    variant: "hello",
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (
        path.includes("/translations?") &&
        path.includes("targetLocaleId=fr-FR") &&
        path.includes("fileUri=messages.json")
      ) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    hashcode: "hash-1",
                    fileUri: "messages.json",
                    translation: "Bonjour",
                    targetLocaleId: "fr-FR",
                    authorized: true,
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pullSmartlingTaskContent({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      credential: { id: "cred_1" } as never,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
    });

    expect(result).toMatchObject({
      externalJobId: "job-1",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });
    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({
      externalStringId: "hash-1",
      key: "hello",
      sourceText: "Hello",
      fileId: "messages.json",
      translations: [{ locale: "fr-FR", text: "Bonjour", isApproved: true }],
    });
  });
});
