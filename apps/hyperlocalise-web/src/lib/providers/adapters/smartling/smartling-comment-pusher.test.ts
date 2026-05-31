import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";

import { buildHyperlocaliseFindingMarker } from "./smartling-comment-write-back";
import { pushSmartlingProviderComments } from "./smartling-comment-pusher";

function sampleFinding(overrides?: Partial<ProviderQaFinding>): ProviderQaFinding {
  return {
    checkType: "glossary_violation",
    severity: "error",
    message: "Forbidden term",
    item: {
      externalStringId: "hash-abc",
      key: "welcome.title",
      locale: "fr-FR",
      field: "target",
    },
    ...overrides,
  };
}

describe("pushSmartlingProviderComments", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates Smartling issues for new findings", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createIssueCalls = 0;

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

      if (path.endsWith("/issues/list") && method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { items: [], totalCount: 0 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/issues") && method === "POST" && !path.endsWith("/issues/list")) {
        createIssueCalls += 1;
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                issueUid: "issue-new-1",
                issueText: buildHyperlocaliseFindingMarker(findingId),
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      secretMaterial: "user:secret:acct-1",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(createIssueCalls).toBe(1);
    expect(result.posted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.changedItems).toEqual([
      expect.objectContaining({
        type: "provider_comment",
        findingId,
        status: "posted",
        externalIssueUid: "issue-new-1",
      }),
    ]);
  });

  it("skips creation when a known external issue id already exists", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createIssueCalls = 0;

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

      if (path.endsWith("/issues/list") && method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { items: [], totalCount: 0 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/issues") && method === "POST" && !path.endsWith("/issues/list")) {
        createIssueCalls += 1;
        return new Response("unexpected create", { status: 500 });
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      secretMaterial: "user:secret:acct-1",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map([[findingId, { issueUid: "issue-existing-1" }]]),
    });

    expect(createIssueCalls).toBe(0);
    expect(result.posted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.changedItems[0]).toMatchObject({
      status: "skipped",
      externalIssueUid: "issue-existing-1",
      message: "provider_comment_already_exists",
    });
  });

  it("requests only OPENED issues when checking remote duplicates", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);

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

      if (path.endsWith("/issues/list") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          issueStateCodes?: string[];
        };
        expect(body.issueStateCodes).toEqual(["OPENED"]);
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { items: [], totalCount: 0 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/issues") && method === "POST" && !path.endsWith("/issues/list")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { issueUid: "issue-new-1" },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      secretMaterial: "user:secret:acct-1",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(result.posted).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("skips creation when Smartling already has a matching marker issue", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);
    let createIssueCalls = 0;

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

      if (path.endsWith("/issues/list") && method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    issueUid: "issue-remote-1",
                    issueText: buildHyperlocaliseFindingMarker(findingId),
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/issues") && method === "POST" && !path.endsWith("/issues/list")) {
        createIssueCalls += 1;
        return new Response("unexpected create", { status: 500 });
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      secretMaterial: "user:secret:acct-1",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(createIssueCalls).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.changedItems[0]).toMatchObject({
      status: "skipped",
      externalIssueUid: "issue-remote-1",
    });
  });

  it("records per-finding failures when issue creation fails", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);

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

      if (path.endsWith("/issues/list") && method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { items: [], totalCount: 0 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/issues") && method === "POST" && !path.endsWith("/issues/list")) {
        return new Response(
          JSON.stringify({
            response: { code: "VALIDATION_ERROR", errors: [{ message: "invalid issue type" }] },
          }),
          { status: 400 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      secretMaterial: "user:secret:acct-1",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(result.posted).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      expect.objectContaining({
        findingId,
        message: expect.any(String),
      }),
    ]);
    expect(result.changedItems[0]).toMatchObject({
      status: "failed",
      findingId,
    });
  });

  it("records validation failures in changedItems before posting", async () => {
    const finding = sampleFinding({
      item: { externalStringId: "  ", key: "k1", locale: "fr-FR" },
    });
    const findingId = buildFindingId(finding);
    const fetchMock = vi.fn();

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      secretMaterial: "user:secret:acct-1",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.changedItems).toEqual([
      expect.objectContaining({
        findingId,
        status: "failed",
        message: "smartling_comment_missing_hashcode",
      }),
    ]);
  });

  it("does not infer a default locale when feedback spans multiple locales", async () => {
    const frFinding = sampleFinding({
      item: { externalStringId: "hash-fr", key: "k1", locale: "fr-FR" },
    });
    const deFinding = sampleFinding({
      item: { externalStringId: "hash-de", key: "k2", locale: "de-DE" },
    });
    const missingLocale = sampleFinding({
      item: { externalStringId: "hash-missing", key: "k3" },
    });
    const missingLocaleId = buildFindingId(missingLocale);
    let createIssueCalls = 0;

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

      if (path.endsWith("/issues/list") && method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { items: [], totalCount: 0 },
            },
          }),
          { status: 200 },
        );
      }

      if (path.endsWith("/issues") && method === "POST" && !path.endsWith("/issues/list")) {
        createIssueCalls += 1;
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { issueUid: `issue-${createIssueCalls}` },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await pushSmartlingProviderComments({
      organizationId: "org_1",
      projectId: "proj_1",
      providerKind: "smartling",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      secretMaterial: "user:secret:acct-1",
      feedback: [
        { findingId: buildFindingId(frFinding), finding: frFinding },
        { findingId: buildFindingId(deFinding), finding: deFinding },
        { findingId: missingLocaleId, finding: missingLocale },
      ],
      knownExternalIds: new Map(),
    });

    expect(createIssueCalls).toBe(2);
    expect(result.posted).toBe(2);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          findingId: missingLocaleId,
          message: "smartling_comment_missing_locale",
        }),
      ]),
    );
    expect(result.changedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          findingId: missingLocaleId,
          status: "failed",
          message: "smartling_comment_missing_locale",
        }),
      ]),
    );
  });
});
