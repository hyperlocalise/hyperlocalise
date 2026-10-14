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
  translationsByLocale: { es: { "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola" } },
};

const connectionToken = "hl_figma_test_connection_token";

const sessionPayload = {
  organization: { id: "org_1", name: "Acme", slug: "acme" },
  project: null,
  projects: [],
  connection: {
    id: "conn_1",
    displayName: "Design",
    sourceLocale: "en-US",
    targetLocales: ["es"],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function expectConnectionTokenOnly(headers: Headers) {
  expect(headers.get("x-hyperlocalise-connection-token")).toBe(connectionToken);
  expect(headers.get("x-hyperlocalise-access-token")).toBeNull();
  expect(headers.get("x-api-key")).toBeNull();
  expect(headers.get("authorization")).toBeNull();
}

describe("figma hyperlocalise client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the connection token when loading the session", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expectConnectionTokenOnly(requestHeaders(input, init));
      return jsonResponse({ session: sessionPayload });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchFigmaSession({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
      }),
    ).resolves.toMatchObject({
      organization: { slug: "acme" },
      connection: { id: "conn_1" },
    });
  });

  it("loads the current page job for a project", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestUrl(input)).toBe(
        "https://app.hyperlocalise.com/api/integrations/figma/jobs/current?fileKey=file-1&pageId=page-1&projectId=proj_1",
      );
      expectConnectionTokenOnly(requestHeaders(input, init));
      return jsonResponse({ job: pageJob });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCurrentFigmaJob({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
        fileKey: "file-1",
        pageId: "page-1",
        projectId: "proj_1",
      }),
    ).resolves.toEqual({ job: pageJob });
  });

  it("returns null when no job exists for the page", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ job: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCurrentFigmaJob({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
        fileKey: "file-1",
        pageId: "page-1",
        projectId: "proj_1",
      }),
    ).resolves.toEqual({ job: null });
  });

  it("omits projectId from the current job query when unset", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(requestUrl(input)).toBe(
        "https://app.hyperlocalise.com/api/integrations/figma/jobs/current?fileKey=file-1&pageId=page-1",
      );
      return jsonResponse({ job: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCurrentFigmaJob({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
        fileKey: "file-1",
        pageId: "page-1",
        projectId: "",
      }),
    ).resolves.toEqual({ job: null });
  });

  it("pulls translations as a page job payload", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        translations: pageJob,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pullFigmaTranslations({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
        projectId: "proj_1",
        fileKey: "file-1",
        pageId: "page-1",
      }),
    ).resolves.toEqual(pageJob);
  });

  it("pulls translations by locale map", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        translations: { es: { "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola" } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pullFigmaTranslations({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
        projectId: "proj_1",
        fileKey: "file-1",
        pageId: "page-1",
      }),
    ).resolves.toEqual({ es: { "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola" } });
  });

  it("does not include the connection token in client error messages", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: "figma_connection_not_found", message: "Figma connection token is invalid." },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchFigmaSession({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
      }),
    ).rejects.toMatchObject({
      code: "figma_connection_not_found",
      message: "Figma connection token is invalid.",
    });

    try {
      await fetchFigmaSession({
        appUrl: "https://app.hyperlocalise.com",
        auth: { connectionToken },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(HyperlocaliseClientError);
      expect(String(error)).not.toContain(connectionToken);
    }
  });
});
