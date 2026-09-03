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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

const { workspaceVisualWorkflowsFlagRunMock } = vi.hoisted(() => ({
  workspaceVisualWorkflowsFlagRunMock: vi.fn(async () => true),
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
    workspaceVisualWorkflowsFlag: {
      run: workspaceVisualWorkflowsFlagRunMock,
    },
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  workspaceVisualWorkflowsFlagRunMock.mockResolvedValue(true);
  await fixture.cleanup();
});

async function getOrganizationId(workosOrganizationId: string) {
  const [organization] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId))
    .limit(1);

  if (!organization) {
    throw new Error("expected test organization");
  }

  return organization.id;
}

describe("visual workflow routes", () => {
  it("creates, reads, updates, and lists visual workflows for an operator", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = await getOrganizationId(identity.organization.workosOrganizationId);

    const createdResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"].$post(
      {
        param: { organizationSlug },
        json: { name: "Lead ping" },
      },
      { headers },
    );

    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      visualWorkflow: { id: string; name: string; status: string };
    };
    expect(created.visualWorkflow.name).toBe("Lead ping");
    expect(created.visualWorkflow.status).toBe("draft");

    const listedResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"].$get(
      {
        param: { organizationSlug },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );
    expect(listedResponse.status).toBe(200);
    const listed = (await listedResponse.json()) as {
      visualWorkflows: Array<{ id: string }>;
    };
    expect(listed.visualWorkflows.some((row) => row.id === created.visualWorkflow.id)).toBe(true);

    const readResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].$get(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
      },
      { headers },
    );
    expect(readResponse.status).toBe(200);

    const updatedResponse = await client.api.orgs[":organizationSlug"]["visual-workflows"][
      ":visualWorkflowId"
    ].$patch(
      {
        param: {
          organizationSlug,
          visualWorkflowId: created.visualWorkflow.id,
        },
        json: { name: "Lead ping v2" },
      },
      { headers },
    );
    expect(updatedResponse.status).toBe(200);
    const updated = (await updatedResponse.json()) as {
      visualWorkflow: { name: string };
    };
    expect(updated.visualWorkflow.name).toBe("Lead ping v2");

    const rows = await db
      .select()
      .from(schema.visualWorkflows)
      .where(eq(schema.visualWorkflows.organizationId, organizationId));
    expect(rows.some((row) => row.id === created.visualWorkflow.id)).toBe(true);
  });

  it("returns forbidden when the visual workflows feature flag is disabled", async () => {
    workspaceVisualWorkflowsFlagRunMock.mockResolvedValue(false);
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["visual-workflows"].$get(
      {
        param: { organizationSlug },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });
});
