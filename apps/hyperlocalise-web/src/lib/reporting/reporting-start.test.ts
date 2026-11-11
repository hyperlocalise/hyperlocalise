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

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import {
  reserveUsageEvent,
  usageFeatureIds,
  type UsageFeatureId,
} from "@/lib/billing/usage-control";
import { db, schema } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";

import { getReportingStart } from "./reporting-start";
import { startReportingForTest } from "./reporting.fixture";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceReportsFlag: vi.fn(async () => true),
}));

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return { ...actual, resolveWorkspaceReportsFlag: mocks.resolveWorkspaceReportsFlag };
});

const authFixture = createAuthTestFixture();

beforeEach(() => {
  mocks.resolveWorkspaceReportsFlag.mockReset().mockResolvedValue(true);
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createOrganization() {
  const { organization } = await authFixture.createLocalWorkosIdentity();
  return organization;
}

async function reserve(
  organizationId: string,
  featureId: UsageFeatureId = usageFeatureIds.aiTokens,
) {
  const operationKey = `run_${randomUUID()}:ai_tokens`;
  const reserved = await reserveUsageEvent({
    organizationId,
    featureId,
    operationKey,
    source: "chat_turn",
    quantity: 120,
    modelId: "openai/gpt-5-mini",
    credentialSource: "gateway",
  });
  if (isErr(reserved)) throw new Error(reserved.error.code);
  const [row] = await db
    .select({ createdAt: schema.usageEvents.createdAt })
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, operationKey));
  return row!.createdAt;
}

describe("Reports start at a workspace's first AI use", () => {
  it("starts at the first token row when Reports is on", async () => {
    const organization = await createOrganization();

    const recordedAt = await reserve(organization.id);
    await reserve(organization.id);

    expect(await getReportingStart(organization.id)).toEqual(recordedAt);
  });

  it("does not start a workspace with Reports off", async () => {
    mocks.resolveWorkspaceReportsFlag.mockResolvedValue(false);
    const organization = await createOrganization();

    await reserve(organization.id);

    expect(await getReportingStart(organization.id)).toBeNull();
  });

  it("does not start on a run reservation, only on its token row", async () => {
    const organization = await createOrganization();

    await reserve(organization.id, usageFeatureIds.agentRuns);

    expect(await getReportingStart(organization.id)).toBeNull();
  });

  it("keeps an existing start", async () => {
    const organization = await createOrganization();
    const started = new Date("2026-01-01T00:00:00.000Z");
    await startReportingForTest(organization.id, started);

    await reserve(organization.id);

    expect(await getReportingStart(organization.id)).toEqual(started);
    expect(mocks.resolveWorkspaceReportsFlag).not.toHaveBeenCalled();
  });

  it("still records the charge when the Reports check fails", async () => {
    mocks.resolveWorkspaceReportsFlag.mockRejectedValue(new Error("flags unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const organization = await createOrganization();

    await expect(reserve(organization.id)).resolves.toBeInstanceOf(Date);

    expect(await getReportingStart(organization.id)).toBeNull();
    expect(error).toHaveBeenCalledWith("reporting_start_failed", expect.anything());
    error.mockRestore();
  });
});
