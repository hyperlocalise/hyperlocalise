import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  fetchCurrentFigmaJob,
  fetchFigmaSession,
  HyperlocaliseClientError,
  pullFigmaTranslations,
} from "./hyperlocalise-client";
import type { FigmaPageJob } from "./plugin-messages";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function requestHeaders(_input: RequestInfo | URL, init?: RequestInit) {
  return new Headers(init?.headers);
}

const pageJob: FigmaPageJob = {
  jobId: "job_figma",
  status: "waiting_for_review",
  projectId: "proj_1",
  sourcePath: "figma/files/file-1/pages/page-1.json",
  targetLocales: ["es"],
  lastError: null,
  translationsByLocale: { es: { "figma.segment.1:1.0": "Hola" } },
};

const personalAccessToken = "hl_test_token";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function expectApiKeyOnly(headers: Headers) {
  expect(headers.get("x-api-key")).toBe(personalAccessToken);
  expect(headers.get("authorization")).toBeNull();
  expect(headers.get("x-hyperlocalise-figma-session")).toBeNull();
  expect(headers.get("x-hyperlocalise-organization-slug")).toBeNull();
}

describe("figma hyperlocalise client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the PAT only as x-api-key when loading the session", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expectApiKeyOnly(requestHeaders(input, init));
      return jsonResponse({
        session: {
          user: { email: "dev@example.com", localUserId: "user_1" },
          organization: { slug: "acme", name: "Acme", id: "org_1" },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchFigmaSession({
        appUrl: "https://app.hyperlocalise.com",
        personalAccessToken,
      }),
    ).resolves.toMatchObject({
      user: { email: "dev@example.com" },
      organization: { slug: "acme" },
    });
  });

  it("loads the current page job and omits an empty projectId", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestUrl(input)).toBe(
        "https://app.hyperlocalise.com/api/integrations/figma/jobs/current?fileKey=file-1&pageId=page-1",
      );
      expectApiKeyOnly(requestHeaders(input, init));
      return jsonResponse({ job: pageJob });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCurrentFigmaJob({
        appUrl: "https://app.hyperlocalise.com",
        personalAccessToken,
        fileKey: "file-1",
        pageId: "page-1",
      }),
    ).resolves.toEqual(pageJob);
  });

  it("scopes the current page job when a project id is provided", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(requestUrl(input)).toContain("projectId=proj_1");
      return jsonResponse({ job: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCurrentFigmaJob({
        appUrl: "https://app.hyperlocalise.com",
        personalAccessToken,
        fileKey: "file-1",
        pageId: "page-1",
        projectId: "proj_1",
      }),
    ).resolves.toBeNull();
  });

  it("pulls waiting-for-review translations and rejects in-flight jobs", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ translations: pageJob }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pullFigmaTranslations({
        appUrl: "https://app.hyperlocalise.com",
        personalAccessToken,
        projectId: "proj_1",
        fileKey: "file-1",
        pageId: "page-1",
      }),
    ).resolves.toMatchObject({ status: "waiting_for_review", jobId: "job_figma" });

    fetchMock.mockImplementation(async () =>
      jsonResponse({
        translations: { ...pageJob, status: "running", translationsByLocale: {} },
      }),
    );

    await expect(
      pullFigmaTranslations({
        appUrl: "https://app.hyperlocalise.com",
        personalAccessToken,
        projectId: "proj_1",
        fileKey: "file-1",
        pageId: "page-1",
      }),
    ).rejects.toBeInstanceOf(HyperlocaliseClientError);
  });

  it("does not include the PAT in client error messages", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: "unauthorized", message: "Invalid or revoked API key" }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchFigmaSession({
        appUrl: "https://app.hyperlocalise.com",
        personalAccessToken,
      }),
    ).rejects.toMatchObject({
      code: "unauthorized",
      message: "Invalid or revoked API key",
    });

    try {
      await fetchFigmaSession({
        appUrl: "https://app.hyperlocalise.com",
        personalAccessToken,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HyperlocaliseClientError);
      expect(String(error)).not.toContain(personalAccessToken);
    }
  });
});
