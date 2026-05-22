import { describe, expect, it, vi } from "vite-plus/test";

import {
  SmartlingApiClient,
  SmartlingApiError,
  classifySmartlingHttpError,
  deriveServiceBaseUrl,
} from "./smartling-api";

describe("SmartlingApiClient", () => {
  const credentials = {
    userIdentifier: "user-1",
    userSecret: "secret-1",
    accountUid: "acct-1",
  };

  function createClient(fetchFn: typeof fetch) {
    return new SmartlingApiClient({
      credentials,
      authBaseUrl: "https://api.smartling.test/auth-api/v2",
      accountsBaseUrl: "https://api.smartling.test/accounts-api/v2",
      projectsBaseUrl: "https://api.smartling.test/projects-api/v2",
      filesBaseUrl: "https://api.smartling.test/files-api/v2",
      stringsBaseUrl: "https://api.smartling.test/strings-api/v2",
      jobsBaseUrl: "https://api.smartling.test/jobs-api/v3",
      fetchFn,
    });
  }

  it("authenticates and caches the access token", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accessToken: "access-token",
                refreshToken: "refresh-token",
                expiresIn: 3600,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const first = await client.getAccessToken();
    const second = await client.getAccessToken();

    expect(first).toBe("access-token");
    expect(second).toBe("access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the access token when it is near expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate/refresh")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accessToken: "refreshed-token",
                refreshToken: "refresh-token",
                expiresIn: 3600,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accessToken: "access-token",
                refreshToken: "refresh-token",
                expiresIn: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await client.getAccessToken();
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const refreshed = await client.getAccessToken();

    expect(refreshed).toBe("refreshed-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smartling.test/auth-api/v2/authenticate/refresh",
      expect.objectContaining({ method: "POST" }),
    );

    vi.useRealTimers();
  });

  it("lists account projects with pagination", async () => {
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

      if (String(url).includes("/accounts/acct-1/projects")) {
        if (String(url).includes("offset=0")) {
          return new Response(
            JSON.stringify({
              response: {
                code: "SUCCESS",
                data: {
                  items: [
                    {
                      accountUid: "acct-1",
                      projectId: "proj-1",
                      projectName: "Marketing",
                      sourceLocaleId: "en-US",
                      archived: false,
                      projectTypeCode: "GDN",
                    },
                  ],
                  totalCount: 2,
                },
              },
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    accountUid: "acct-1",
                    projectId: "proj-2",
                    projectName: "Mobile",
                    sourceLocaleId: "en-US",
                    archived: false,
                  },
                ],
                totalCount: 2,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const projects = await client.listAccountProjects("acct-1");

    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      projectId: "proj-1",
      projectName: "Marketing",
      sourceLocaleId: "en-US",
    });
  });

  it("throws SmartlingApiError on auth failure", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "AUTHENTICATION_ERROR",
            errors: [{ message: "Invalid credentials" }],
          },
        }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.authenticate()).rejects.toBeInstanceOf(SmartlingApiError);
    await expect(client.authenticate()).rejects.toMatchObject({
      status: 401,
      code: "smartling_auth_invalid",
    });
  });

  it("classifies paid or unavailable API responses", () => {
    expect(
      classifySmartlingHttpError(403, {
        response: {
          code: "FEATURE_NOT_AVAILABLE",
          errors: [{ message: "API access is not enabled on your subscription" }],
        },
      }),
    ).toMatchObject({
      errorCode: "smartling_api_unavailable",
    });
  });

  it("uses classified error codes for non-success envelopes on HTTP 200", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "MAX_OPERATIONS_LIMIT_EXCEEDED",
            errors: [{ message: "Rate limit exceeded" }],
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.authenticate()).rejects.toMatchObject({
      status: 200,
      code: "smartling_request_failed",
    });
  });

  it("lists project files with pagination", async () => {
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

      if (String(url).includes("/files/list") && String(url).includes("offset=0")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ fileUri: "a.json", fileType: "json" }],
                totalCount: 2,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/files/list")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ fileUri: "b.json", fileType: "json" }],
                totalCount: 2,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const files = await client.listProjectFiles("proj-1");

    expect(files).toHaveLength(2);
    expect(files[0]?.fileUri).toBe("a.json");
    expect(files[1]?.fileUri).toBe("b.json");
  });

  it("lists source strings filtered by fileUri", async () => {
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

      if (String(url).includes("/source-strings")) {
        expect(String(url)).toContain("fileUri=messages.json");
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ hashcode: "hash-1", stringText: "Hello", fileUri: "messages.json" }],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const strings = await client.listSourceStrings("proj-1", { fileUri: "messages.json" });

    expect(strings).toHaveLength(1);
    expect(strings[0]).toMatchObject({ hashcode: "hash-1", stringText: "Hello" });
  });

  it("lists jobs for a project", async () => {
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

      if (String(url).includes("/jobs-api/v3/projects/proj-1/jobs")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    translationJobUid: "job-1",
                    jobName: "Launch",
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

    const client = createClient(fetchMock);
    const jobs = await client.listJobs("proj-1");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      translationJobUid: "job-1",
      jobStatus: "AWAITING_AUTHORIZATION",
    });
  });
});

describe("deriveServiceBaseUrl", () => {
  it("derives accounts and projects base URLs from the auth base URL", () => {
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "accounts")).toBe(
      "https://api.smartling.test/accounts-api/v2",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "projects")).toBe(
      "https://api.smartling.test/projects-api/v2",
    );
  });

  it("derives files, strings, and jobs base URLs from the auth base URL", () => {
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "files")).toBe(
      "https://api.smartling.test/files-api/v2",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "strings")).toBe(
      "https://api.smartling.test/strings-api/v2",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "jobs")).toBe(
      "https://api.smartling.test/jobs-api/v3",
    );
  });
});
