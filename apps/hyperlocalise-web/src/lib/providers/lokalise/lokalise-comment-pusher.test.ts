import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";

import { buildHyperlocaliseFindingMarker } from "../smartling/smartling-comment-write-back";
import { pushLokaliseProviderComments } from "./lokalise-comment-pusher";

function sampleFinding(overrides?: Partial<ProviderQaFinding>): ProviderQaFinding {
  return {
    checkType: "glossary_violation",
    severity: "error",
    message: "Forbidden term",
    item: {
      externalStringId: "4242",
      key: "welcome.title",
      locale: "fr",
      field: "target",
    },
    ...overrides,
  };
}

describe("pushLokaliseProviderComments", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates Lokalise key comments for new findings", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createCommentCalls = 0;

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/keys/4242/comments") && method === "GET") {
        return new Response(JSON.stringify({ comments: [] }), { status: 200 });
      }

      if (path.includes("/keys/4242/comments") && method === "POST") {
        createCommentCalls += 1;
        return new Response(
          JSON.stringify({
            comments: [
              {
                comment_id: 55,
                key_id: 4242,
                comment: buildHyperlocaliseFindingMarker(findingId),
                added_by: 1,
                added_by_email: "reviewer@example.com",
                added_at: "2026-05-01T10:00:00Z",
                added_at_timestamp: 1746093600,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushLokaliseProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      externalJobId: "55392",
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
        externalProjectId: "proj.123",
        externalJobId: "55392",
        externalThreadId: "55",
        externalCommentId: "55",
      },
    });
  });

  it("skips findings when a matching remote comment already exists", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createCommentCalls = 0;

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/keys/4242/comments") && method === "GET") {
        return new Response(
          JSON.stringify({
            comments: [
              {
                comment_id: 77,
                key_id: 4242,
                comment: `${buildHyperlocaliseFindingMarker(findingId)}\n[glossary_violation] Forbidden term`,
                added_by: 1,
                added_by_email: "reviewer@example.com",
                added_at: "2026-05-01T10:00:00Z",
                added_at_timestamp: 1746093600,
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/keys/4242/comments") && method === "POST") {
        createCommentCalls += 1;
        return new Response(JSON.stringify({ comments: [{ comment_id: 99 }] }), {
          status: 200,
        });
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushLokaliseProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      externalJobId: "55392",
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

  it("skips findings when known external ids were stored from a prior run", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createCommentCalls = 0;

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/keys/4242/comments") && method === "GET") {
        return new Response(JSON.stringify({ comments: [] }), { status: 200 });
      }

      if (path.includes("/keys/4242/comments") && method === "POST") {
        createCommentCalls += 1;
        return new Response(JSON.stringify({ comments: [{ comment_id: 99 }] }), {
          status: 200,
        });
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const knownExternalIds = new Map([[findingId, { issueUid: "88", commentUid: "88" }]]);

    const result = await pushLokaliseProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "lokalise",
      externalProjectId: "proj.123",
      externalJobId: "55392",
      secretMaterial: "token",
      feedback: [{ findingId, finding }],
      knownExternalIds,
    });

    expect(createCommentCalls).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.changedItems[0]?.externalCommentUid).toBe("88");
  });
});
