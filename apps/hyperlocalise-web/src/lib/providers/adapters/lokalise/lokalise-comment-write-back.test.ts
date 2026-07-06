import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import { buildHyperlocaliseFindingMarker } from "@/lib/providers/adapters/smartling/smartling-provider";

import { lokaliseTmsProvider } from "./lokalise-provider";

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

describe("pushComments write-back entries", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds comment payloads with finding markers", async () => {
    const finding = sampleFinding();
    const findingId = buildFindingId(finding);

    const fetchMock = vi.fn(async (url, init) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.includes("/keys/4242/comments") && method === "GET") {
        return new Response(JSON.stringify({ comments: [] }), { status: 200 });
      }

      if (path.includes("/keys/4242/comments") && method === "POST") {
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
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    const result = await lokaliseTmsProvider.pushComments({
      organizationId: "org_1",
      projectId: "proj_1",
      externalProjectId: "proj.123",
      externalJobId: "55392",
      credential: { baseUrl: null } as never,
      secretMaterial: "token",
      feedback: [{ findingId, finding }],
      knownExternalIds: new Map(),
    });

    expect(result?.failures).toEqual([]);
    expect(result?.posted).toBe(1);
  });
});
