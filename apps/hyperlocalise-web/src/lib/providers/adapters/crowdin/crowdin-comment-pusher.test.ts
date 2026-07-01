import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";

import { buildHyperlocaliseFindingMarker } from "../smartling/smartling-comment-write-back";
import { pushCrowdinProviderComments } from "./crowdin-comment-pusher";

function sampleFinding(overrides?: Partial<ProviderQaFinding>): ProviderQaFinding {
  return {
    checkType: "glossary_violation",
    severity: "error",
    message: "Forbidden term",
    item: {
      externalStringId: "100",
      key: "welcome.title",
      locale: "fr",
      field: "target",
    },
    ...overrides,
  };
}

function crowdinListResponse<T>(items: T[]) {
  return new Response(
    JSON.stringify({
      data: items.map((item) => ({ data: item })),
    }),
    { status: 200 },
  );
}

function crowdinItemResponse<T>(data: T) {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

describe("pushCrowdinProviderComments", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates Crowdin string issues for new findings", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createCommentCalls = 0;

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/projects/1/comments") && method === "GET") {
        return crowdinListResponse([]);
      }

      if (path.endsWith("/projects/1/comments") && method === "POST") {
        createCommentCalls += 1;
        return crowdinItemResponse({
          id: 55,
          text: buildHyperlocaliseFindingMarker(findingId),
          userId: 1,
          stringId: 100,
          languageId: "fr",
          type: "issue",
          projectId: 1,
          createdAt: "2026-05-01T10:00:00Z",
        });
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushCrowdinProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "crowdin",
      externalProjectId: "1",
      externalJobId: "9",
      credential: { baseUrl: null },
      secretMaterial: "token",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(createCommentCalls).toBe(1);
    expect(result.posted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.changedItems[0]).toMatchObject({
      status: "posted",
      externalCommentUid: "55",
      providerReviewContext: {
        externalProjectId: "1",
        externalJobId: "9",
        externalThreadId: "55",
        externalCommentId: "55",
      },
    });
  });

  it("skips findings when a matching remote issue already exists", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createCommentCalls = 0;

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/projects/1/comments") && method === "GET") {
        return crowdinListResponse([
          {
            id: 77,
            text: buildHyperlocaliseFindingMarker(findingId),
            userId: 1,
            stringId: 100,
            languageId: "fr",
            type: "issue",
            projectId: 1,
            createdAt: "2026-05-01T10:00:00Z",
          },
        ]);
      }

      if (path.endsWith("/projects/1/comments") && method === "POST") {
        createCommentCalls += 1;
        return crowdinItemResponse({ id: 99 });
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushCrowdinProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "crowdin",
      externalProjectId: "1",
      externalJobId: "9",
      credential: { baseUrl: null },
      secretMaterial: "token",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(createCommentCalls).toBe(0);
    expect(result.posted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.changedItems[0]?.status).toBe("skipped");
    expect(result.changedItems[0]?.externalCommentUid).toBe("77");
  });

  it("uses the configured Crowdin API base URL when set", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    const enterpriseBaseUrl = "https://enterprise.crowdin.test/api/v2";

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      expect(path.startsWith(enterpriseBaseUrl)).toBe(true);

      if (path.includes("/projects/1/comments") && method === "GET") {
        return crowdinListResponse([]);
      }

      if (path.endsWith("/projects/1/comments") && method === "POST") {
        return crowdinItemResponse({
          id: 55,
          text: buildHyperlocaliseFindingMarker(findingId),
          userId: 1,
          stringId: 100,
          languageId: "fr",
          type: "issue",
          projectId: 1,
          createdAt: "2026-05-01T10:00:00Z",
        });
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await pushCrowdinProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "crowdin",
      externalProjectId: "1",
      externalJobId: "9",
      credential: { baseUrl: enterpriseBaseUrl },
      secretMaterial: "token",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
