import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchSmartlingJobTasks } from "./smartling-job-fetcher";

describe("fetchSmartlingJobTasks", () => {
  let originalFetch: typeof fetch;

  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "smartling" as const,
    displayName: "Smartling",
    region: null,
    baseUrl: null,
    validationStatus: "connected",
    validationMessage: null,
    lastValidatedAt: null,
    encryptionAlgorithm: "aes-256-gcm",
    keyVersion: 1,
    ciphertext: "cipher",
    iv: "iv",
    authTag: "tag",
    maskedSecretSuffix: "cret",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized job metadata from Smartling", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
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

      if (path.includes("/projects-api/v2/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId: "proj-1",
                projectName: "Marketing",
                sourceLocaleId: "en-US",
                archived: false,
                targetLocales: [],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/jobs-api/v3/projects/proj-1/jobs")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    translationJobUid: "job-1",
                    jobName: "French launch",
                    jobStatus: "IN_PROGRESS",
                    dueDate: "2026-06-01T00:00:00Z",
                    targetLocaleIds: ["fr-FR"],
                    description: "Homepage strings",
                  },
                  {
                    translationJobUid: "job-2",
                    jobName: "Review pass",
                    jobStatus: "In Review",
                    targetLocaleIds: ["de-DE"],
                  },
                  {
                    translationJobUid: "job-3",
                    jobName: "Completed batch",
                    jobStatus: "COMPLETED",
                    targetLocaleIds: ["es-ES"],
                  },
                  {
                    translationJobUid: "job-4",
                    jobName: "Failed import",
                    jobStatus: "FAILED",
                    targetLocaleIds: ["it-IT"],
                  },
                ],
                totalCount: 4,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchSmartlingJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      credential,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
    });

    expect(result).toHaveLength(4);

    expect(result[0]).toMatchObject({
      externalJobId: "job-1",
      externalStatus: "IN_PROGRESS",
      title: "French launch",
      targetLocales: ["fr-FR"],
      kind: "translation",
    });
    expect(result[0]?.externalUrl).toContain("/jobs/job-1");

    expect(result[1]).toMatchObject({
      externalJobId: "job-2",
      externalStatus: "In Review",
      kind: "review",
    });

    expect(result[2]).toMatchObject({
      externalJobId: "job-3",
      externalStatus: "COMPLETED",
    });

    expect(result[3]).toMatchObject({
      externalJobId: "job-4",
      externalStatus: "FAILED",
    });
  });

  it("preserves stable job ids across repeated syncs", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
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

      if (path.includes("/projects-api/v2/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accountUid: "acct-1",
                projectId: "proj-1",
                projectName: "Marketing",
                sourceLocaleId: "en-US",
                archived: false,
                targetLocales: [],
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.includes("/jobs")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    translationJobUid: "job-stable-1",
                    jobName: "Batch 1",
                    jobStatus: "AWAITING_AUTHORIZATION",
                    targetLocaleIds: ["fr-FR"],
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const input = {
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "smartling" as const,
      externalProjectId: "proj-1",
      credential,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
    };

    const first = await fetchSmartlingJobTasks(input);
    const second = await fetchSmartlingJobTasks(input);

    expect(first[0]?.externalJobId).toBe("job-stable-1");
    expect(second[0]?.externalJobId).toBe("job-stable-1");
    expect(first[0]?.externalStatus).toBe(second[0]?.externalStatus);
  });

  it("throws on invalid project id", async () => {
    await expect(
      fetchSmartlingJobTasks({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "smartling",
        externalProjectId: "",
        credential,
        project: {} as never,
        secretMaterial: "user:secret:acct-1",
      }),
    ).rejects.toThrow("invalid_smartling_project_id");
  });

  it("throws smartling_auth_invalid on 401", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
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

      return new Response(
        JSON.stringify({
          response: { code: "AUTHENTICATION_ERROR", errors: [{ message: "Unauthorized" }] },
        }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    await expect(
      fetchSmartlingJobTasks({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "smartling",
        externalProjectId: "proj-1",
        credential,
        project: {} as never,
        secretMaterial: "user:secret:acct-1",
      }),
    ).rejects.toThrow("smartling_auth_invalid");
  });
});
