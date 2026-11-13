/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  assertResolvablePublicHttpUrlMock,
  engineSetupEnqueueMock,
  resolveApiAuthContextFromSessionMock,
  upsertSetupDocumentMock,
  resolveWorkspaceKnowledgeFlagMock,
} = vi.hoisted(() => ({
  assertResolvablePublicHttpUrlMock: vi.fn(),
  engineSetupEnqueueMock: vi.fn(async () => ({ ids: ["wrun_engine_setup_test"] })),
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  upsertSetupDocumentMock: vi.fn(async () =>
    ok({ documentId: "doc_setup_1", revisionId: "22222222-2222-2222-2222-222222222222" }),
  ),
  resolveWorkspaceKnowledgeFlagMock: vi.fn(async () => true),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    resolveWorkspaceKnowledgeFlag: resolveWorkspaceKnowledgeFlagMock,
  };
});

vi.mock("@/lib/engine-setup/setup-guideline-document", () => ({
  upsertSetupGuidelineDocument: upsertSetupDocumentMock,
}));

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();
  return {
    ...actual,
    assertResolvablePublicHttpUrl: assertResolvablePublicHttpUrlMock,
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { completeEngineSetupRun, markEngineSetupRunRunning } from "@/lib/engine-setup/store";
import type { EngineSuggestionDraft } from "@/lib/engine-setup/types";
import { ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(
  createApp({ engineSetupQueue: { enqueue: engineSetupEnqueueMock } }),
);
const fixture = createAuthTestFixture();

const drafts: EngineSuggestionDraft[] = [
  {
    kind: "voice",
    dedupeKey: "voice",
    payload: {
      kind: "voice",
      voice: {
        summary: "Calm and direct.",
        attributes: { formality: 30, playfulness: 30, technicality: 60 },
        doSay: [],
        dontSay: [],
      },
    },
    evidence: [{ url: "https://example.com/", snippet: "You stay in control." }],
    confidence: 80,
    conflict: null,
  },
  {
    kind: "rule",
    dedupeKey: "use sentence case for headings.",
    payload: {
      kind: "rule",
      rule: { text: "Use sentence case for headings.", category: "formatting" },
    },
    evidence: [{ url: "https://example.com/", snippet: "Ship translations faster" }],
    confidence: 50,
    conflict: null,
  },
  {
    kind: "term",
    dedupeKey: "flow studio",
    payload: {
      kind: "term",
      term: {
        term: "Flow Studio",
        termType: "product",
        translatable: false,
        definition: "The review workspace.",
      },
    },
    evidence: [{ url: "https://example.com/", snippet: "Flow Studio lets you review" }],
    confidence: 90,
    conflict: null,
  },
];

function engineSetupClient() {
  return client.api.orgs[":organizationSlug"]["engine-setup"];
}

async function startRun(slug: string, headers: Record<string, string>) {
  return engineSetupClient().$post(
    { param: { organizationSlug: slug }, json: { url: "example.com" } },
    { headers },
  );
}

async function readyRun(runId: string, organizationId: string) {
  await markEngineSetupRunRunning(runId);
  await completeEngineSetupRun({
    runId,
    organizationId,
    sourceLocale: "en",
    pagesRead: 2,
    drafts,
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(true);
  assertResolvablePublicHttpUrlMock.mockResolvedValue(ok(new URL("https://example.com/")));
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("engineSetupRoutes", () => {
  it("denies access when Guidelines is not entitled", async () => {
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(false);
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await engineSetupClient().$get(
      { param: { organizationSlug: identity.organization.slug ?? "missing-slug" } },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "feature_unavailable" });
  });

  it("only lets admins start a run", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await startRun(identity.organization.slug ?? "missing-slug", headers);

    expect(response.status).toBe(403);
    expect(engineSetupEnqueueMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe URLs before creating a run", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await engineSetupClient().$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { url: "http://127.0.0.1/admin" },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    expect(engineSetupEnqueueMock).not.toHaveBeenCalled();
  });

  it("starts one run at a time and enqueues the workflow", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";

    const first = await startRun(slug, headers);
    expect(first.status).toBe(202);
    const body = (await first.json()) as { engineSetupRun: { id: string; status: string } };
    expect(body.engineSetupRun).toMatchObject({
      status: "queued",
      sourceUrl: "https://example.com/",
    });
    expect(engineSetupEnqueueMock).toHaveBeenCalledWith({ runId: body.engineSetupRun.id });

    const [stored] = await db
      .select({ workflowRunId: schema.engineSetupRuns.workflowRunId })
      .from(schema.engineSetupRuns)
      .where(eq(schema.engineSetupRuns.id, body.engineSetupRun.id));
    expect(stored?.workflowRunId).toBe("wrun_engine_setup_test");

    const second = await startRun(slug, headers);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({
      error: "engine_setup_run_in_progress",
      details: { runId: body.engineSetupRun.id },
    });
  });

  it("marks the run failed when the workflow cannot be enqueued", async () => {
    engineSetupEnqueueMock.mockRejectedValueOnce(new Error("queue down"));
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await startRun(identity.organization.slug ?? "missing-slug", headers);

    expect(response.status).toBe(503);
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";
    const [run] = await db
      .select({ status: schema.engineSetupRuns.status })
      .from(schema.engineSetupRuns)
      .where(eq(schema.engineSetupRuns.organizationId, organizationId));
    expect(run?.status).toBe("failed");
  });

  it("reviews and applies suggestions into a new glossary and the setup document", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";

    const started = (await (await startRun(slug, headers)).json()) as {
      engineSetupRun: { id: string };
    };
    const runId = started.engineSetupRun.id;
    await readyRun(runId, organizationId);

    const detail = await engineSetupClient()[":runId"].$get(
      { param: { organizationSlug: slug, runId } },
      { headers },
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      engineSetupRun: { status: string };
      suggestions: Array<{ id: string; kind: string; status: string }>;
    };
    expect(detailBody.engineSetupRun.status).toBe("ready");
    // High-confidence voice and term start accepted; the low-confidence rule waits for review.
    expect(Object.fromEntries(detailBody.suggestions.map((s) => [s.kind, s.status]))).toEqual({
      voice: "accepted",
      rule: "pending",
      term: "accepted",
    });

    const ruleId = detailBody.suggestions.find((s) => s.kind === "rule")!.id;
    const reviewed = await engineSetupClient()[":runId"].suggestions.$patch(
      {
        param: { organizationSlug: slug, runId },
        json: { suggestionIds: [ruleId], status: "accepted" },
      },
      { headers },
    );
    expect(reviewed.status).toBe(200);
    await expect(reviewed.json()).resolves.toEqual({ suggestions: { updated: 1 } });

    const applied = await engineSetupClient()[":runId"].apply.$post(
      { param: { organizationSlug: slug, runId }, json: {} },
      { headers },
    );
    expect(applied.status).toBe(200);
    const appliedBody = (await applied.json()) as {
      engineSetupRun: { status: string; appliedGlossaryId: string };
      applied: { termsAdded: number; rulesApplied: number; voiceApplied: boolean };
    };
    expect(appliedBody.engineSetupRun.status).toBe("applied");
    expect(appliedBody.applied).toMatchObject({
      termsAdded: 1,
      rulesApplied: 1,
      voiceApplied: true,
    });

    const [concept] = await db
      .select({
        primaryTerm: schema.glossaryConcepts.primaryTerm,
        translatable: schema.glossaryConcepts.translatable,
      })
      .from(schema.glossaryConcepts)
      .innerJoin(schema.glossaries, eq(schema.glossaryConcepts.glossaryId, schema.glossaries.id))
      .where(
        and(
          eq(schema.glossaries.organizationId, organizationId),
          eq(schema.glossaries.id, appliedBody.engineSetupRun.appliedGlossaryId),
        ),
      );
    expect(concept).toEqual({ primaryTerm: "Flow Studio", translatable: false });

    expect(upsertSetupDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationSlug: slug, sourceUrl: "https://example.com/" }),
    );
    const [stored] = await db
      .select({ appliedKnowledgeRevisionId: schema.engineSetupRuns.appliedKnowledgeRevisionId })
      .from(schema.engineSetupRuns)
      .where(eq(schema.engineSetupRuns.id, runId));
    expect(stored?.appliedKnowledgeRevisionId).toBe("22222222-2222-2222-2222-222222222222");

    const again = await engineSetupClient()[":runId"].apply.$post(
      { param: { organizationSlug: slug, runId }, json: {} },
      { headers },
    );
    expect(again.status).toBe(409);
  });

  it("refuses to apply when nothing is accepted", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const slug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId ?? "";

    const started = (await (await startRun(slug, headers)).json()) as {
      engineSetupRun: { id: string };
    };
    const runId = started.engineSetupRun.id;
    await readyRun(runId, organizationId);
    await db
      .update(schema.engineSetupSuggestions)
      .set({ status: "rejected" })
      .where(eq(schema.engineSetupSuggestions.runId, runId));

    const response = await engineSetupClient()[":runId"].apply.$post(
      { param: { organizationSlug: slug, runId }, json: {} },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "engine_setup_nothing_to_apply",
    });
  });

  it("hides runs from other organizations", async () => {
    const owner = fixture.createWorkosIdentity();
    const ownerHeaders = await fixture.authHeadersFor(owner);
    const started = (await (
      await startRun(owner.organization.slug ?? "missing-slug", ownerHeaders)
    ).json()) as { engineSetupRun: { id: string } };

    const other = fixture.createWorkosIdentity();
    const otherHeaders = await fixture.authHeadersFor(other);
    const response = await engineSetupClient()[":runId"].$get(
      {
        param: {
          organizationSlug: other.organization.slug ?? "missing-slug",
          runId: started.engineSetupRun.id,
        },
      },
      { headers: otherHeaders },
    );

    expect(response.status).toBe(404);
  });
});
