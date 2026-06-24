import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock, syncWorkspaceResourceUsageToAutumnMock } = vi.hoisted(
  () => ({
    resolveApiAuthContextFromSessionMock: vi.fn(
      (options) =>
        globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
        globalThis.__testApiAuthContext ??
        null,
    ),
    syncWorkspaceResourceUsageToAutumnMock: vi.fn(),
  }),
);

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/billing/workspace-resource-usage-sync", () => ({
  syncWorkspaceResourceUsageToAutumn: syncWorkspaceResourceUsageToAutumnMock,
}));

import { createApp } from "@/api/app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database";

const app = createApp();
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  resolveApiAuthContextFromSessionMock.mockClear();
  syncWorkspaceResourceUsageToAutumnMock.mockReset();
  await fixture.cleanup();
});

function billingUrl(organizationSlug: string, path: string) {
  return `http://localhost/api/orgs/${organizationSlug}/billing/${path}`;
}

describe("billing routes", () => {
  it("returns local workspace resource usage for admins", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await app.request(
      billingUrl(identity.organization.slug ?? "missing-slug", "resource-usage"),
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resourceUsage: {
        seats: 1,
        projects: 0,
        automations: 0,
        integrations: 0,
      },
    });
  });

  it("forbids resource usage reads without billing access", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await app.request(
      billingUrl(identity.organization.slug ?? "missing-slug", "resource-usage"),
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "billing_read_forbidden" });
  });

  it("syncs resource usage to Autumn for billing admins", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    syncWorkspaceResourceUsageToAutumnMock.mockResolvedValue({
      status: "synced",
      resourceUsage: { seats: 1, projects: 0, automations: 0, integrations: 0 },
      results: [],
    });

    const response = await app.request(
      billingUrl(identity.organization.slug ?? "missing-slug", "resource-usage/sync"),
      { method: "POST", headers },
    );

    expect(response.status).toBe(200);
    expect(syncWorkspaceResourceUsageToAutumnMock).toHaveBeenCalledWith({
      organizationId: expect.any(String),
    });
    await expect(response.json()).resolves.toMatchObject({
      syncResult: { status: "synced" },
    });
  });

  it("returns a failure status when billing usage partially fails to sync", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    syncWorkspaceResourceUsageToAutumnMock.mockResolvedValue({
      status: "partial_failed",
      resourceUsage: { seats: 1, projects: 0, automations: 0, integrations: 0 },
      results: [
        {
          featureId: "seats",
          localUsage: 1,
          previousSyncedUsage: 0,
          delta: 1,
          status: "failed",
          operationKey: "workspace-resource:org_123:seats:1",
          error: "autumn_sync_failed",
        },
      ],
    });

    const response = await app.request(
      billingUrl(identity.organization.slug ?? "missing-slug", "resource-usage/sync"),
      { method: "POST", headers },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "billing_resource_usage_sync_partial_failed",
      details: {
        syncResult: {
          status: "partial_failed",
          results: [{ featureId: "seats", status: "failed" }],
        },
      },
    });
  });

  it("forbids resource usage syncs without billing write access", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await app.request(
      billingUrl(identity.organization.slug ?? "missing-slug", "resource-usage/sync"),
      { method: "POST", headers },
    );

    expect(response.status).toBe(403);
    expect(syncWorkspaceResourceUsageToAutumnMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ error: "billing_write_forbidden" });
  });
});
