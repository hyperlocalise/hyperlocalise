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
});
