import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  fetchCurrentFigmaJob,
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

const pageJob: FigmaPageJob = {
  jobId: "job_figma",
  status: "waiting_for_review",
  projectId: "proj_1",
  sourcePath: "figma/files/file-1/pages/page-1.json",
  targetLocales: ["es"],
  lastError: null,
  translationsByLocale: { es: { "figma.segment.1:1.0": "Hola" } },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("figma hyperlocalise client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the current page job and omits an empty projectId", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(requestUrl(input)).toBe(
        "https://app.hyperlocalise.com/api/integrations/figma/jobs/current?fileKey=file-1&pageId=page-1",
      );
      return jsonResponse({ job: pageJob });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCurrentFigmaJob({
        appUrl: "https://app.hyperlocalise.com",
        sealedSession: "sealed.session",
        organizationSlug: "acme",
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
        sealedSession: "sealed.session",
        organizationSlug: "acme",
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
        sealedSession: "sealed.session",
        organizationSlug: "acme",
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
        sealedSession: "sealed.session",
        organizationSlug: "acme",
        projectId: "proj_1",
        fileKey: "file-1",
        pageId: "page-1",
      }),
    ).rejects.toBeInstanceOf(HyperlocaliseClientError);
  });
});
