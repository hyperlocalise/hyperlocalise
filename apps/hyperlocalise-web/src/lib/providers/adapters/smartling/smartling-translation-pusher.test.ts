import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { pushSmartlingTranslations } from "./smartling-translation-pusher";

describe("pushSmartlingTranslations", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("upserts translations, authorizes the job, and records async progress", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.endsWith("/authenticate") && method === "POST") {
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

      if (path.endsWith("/projects/proj-1/jobs/job-1") && method === "GET") {
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

      if (path.endsWith("/locales/fr-FR/translations") && method === "PUT") {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: {} },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/jobs/job-1/authorize") && method === "POST") {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: { authorized: true } },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/jobs/job-1/progress")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { percentComplete: 100 },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      credential: { id: "cred_1" } as never,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
      translations: [{ locale: "fr-FR", text: "Bonjour", externalStringId: "hash-1" }],
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.asyncOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "smartling_upsert_translations", status: "succeeded" }),
        expect.objectContaining({ type: "smartling_authorize_job" }),
        expect.objectContaining({ type: "smartling_job_progress", status: "succeeded" }),
      ]),
    );
  });

  it("rejects empty translation text instead of clearing Smartling strings", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.endsWith("/authenticate") && method === "POST") {
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

      if (path.endsWith("/projects/proj-1/jobs/job-1") && method === "GET") {
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

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingTranslations({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      credential: { id: "cred_1" } as never,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
      translations: [{ locale: "fr-FR", text: "   ", externalStringId: "hash-1" }],
    });

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      {
        locale: "fr-FR",
        fileId: null,
        message: "smartling_translation_missing_text",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/locales/fr-FR/translations"),
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
