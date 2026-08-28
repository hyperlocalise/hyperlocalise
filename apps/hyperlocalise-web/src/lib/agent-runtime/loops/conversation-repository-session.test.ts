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

import { and, eq, lte } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { stopRepositorySandboxMock } = vi.hoisted(() => ({
  stopRepositorySandboxMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/agent-runtime/workspaces/repository-sandbox", () => ({
  stopRepositorySandbox: stopRepositorySandboxMock,
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
  })),
  serializeErrorForLog: vi.fn((error: unknown) => ({ error })),
}));

import { db, schema } from "@/lib/database/client";
import {
  acquireWebRepositorySandboxLease,
  getWebConversationRepositorySession,
  setWebConversationRepositorySession,
  WEB_SESSION_TTL_MS,
} from "./conversation-repository-session";

const createdWorkosOrganizationIds = new Set<string>();
const createdInteractionIds = new Set<string>();

async function createOrganization() {
  const suffix = randomUUID();
  const workosOrganizationId = `org_${suffix}`;
  createdWorkosOrganizationIds.add(workosOrganizationId);

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      workosOrganizationId,
      name: `Example Org ${suffix}`,
      slug: `example-org-${suffix}`,
    })
    .returning();

  return organization;
}

async function createInteraction(organizationId: string) {
  const [interaction] = await db
    .insert(schema.interactions)
    .values({
      organizationId,
      source: "chat_ui",
      title: "Test conversation",
    })
    .returning();

  await db.insert(schema.inboxItems).values({
    interactionId: interaction.id,
    organizationId,
    status: "active",
  });

  createdInteractionIds.add(interaction.id);
  return interaction;
}

async function setSession(
  conversationId: string,
  input: {
    organizationId: string;
    baseVersion: number | null;
    session: Parameters<typeof setWebConversationRepositorySession>[1]["session"];
  },
) {
  return setWebConversationRepositorySession(conversationId, input);
}

describe("web conversation repository session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();

    for (const interactionId of createdInteractionIds) {
      await db
        .delete(schema.interactionRepositorySessions)
        .where(eq(schema.interactionRepositorySessions.interactionId, interactionId));
      await db.delete(schema.inboxItems).where(eq(schema.inboxItems.interactionId, interactionId));
      await db.delete(schema.interactions).where(eq(schema.interactions.id, interactionId));
    }
    createdInteractionIds.clear();

    for (const workosOrganizationId of createdWorkosOrganizationIds) {
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId));
    }
    createdWorkosOrganizationIds.clear();
  });

  it("stops the sandbox when a session expires", async () => {
    const organization = await createOrganization();
    const interaction = await createInteraction(organization.id);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_expired",
          repositoryContextKey: "ctx",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    vi.advanceTimersByTime(WEB_SESSION_TTL_MS + 1);

    await expect(getWebConversationRepositorySession(interaction.id)).resolves.toBeNull();
    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_expired");
    });
  });

  it("stops the overwritten sandbox when a session is replaced", async () => {
    const organization = await createOrganization();
    const interaction = await createInteraction(organization.id);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_old",
          repositoryContextKey: "ctx_old",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    const current = await getWebConversationRepositorySession(interaction.id);
    expect(current?.version).toBe(1);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: current?.version ?? null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_new",
          repositoryContextKey: "ctx_new",
          createdAt: "2026-07-01T12:01:00.000Z",
          lastUsedAt: "2026-07-01T12:01:00.000Z",
        },
      },
    });

    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_old");
    });
    await expect(getWebConversationRepositorySession(interaction.id)).resolves.toMatchObject({
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_new",
        },
      },
    });
  });

  it("rejects stale writes and stops the sandbox from the losing turn", async () => {
    const organization = await createOrganization();
    const interaction = await createInteraction(organization.id);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_initial",
          repositoryContextKey: "ctx_initial",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    const staleRead = await getWebConversationRepositorySession(interaction.id);
    const current = await getWebConversationRepositorySession(interaction.id);
    expect(staleRead?.version).toBe(current?.version);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: current?.version ?? null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_winner",
          repositoryContextKey: "ctx_winner",
          createdAt: "2026-07-01T12:01:00.000Z",
          lastUsedAt: "2026-07-01T12:01:00.000Z",
        },
      },
    });

    const committed = await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: staleRead?.version ?? null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_loser",
          repositoryContextKey: "ctx_loser",
          createdAt: "2026-07-01T12:02:00.000Z",
          lastUsedAt: "2026-07-01T12:02:00.000Z",
        },
      },
    });

    expect(committed).toBe(false);
    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_loser");
    });
    await expect(getWebConversationRepositorySession(interaction.id)).resolves.toMatchObject({
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_winner",
        },
      },
    });
  });

  it("defers sandbox cleanup while a web turn holds an active lease", async () => {
    const organization = await createOrganization();
    const interaction = await createInteraction(organization.id);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_active",
          repositoryContextKey: "ctx_active",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    const releaseLease = acquireWebRepositorySandboxLease("sbx_active");

    vi.advanceTimersByTime(WEB_SESSION_TTL_MS + 1);
    await expect(getWebConversationRepositorySession(interaction.id)).resolves.toBeNull();
    expect(stopRepositorySandboxMock).not.toHaveBeenCalledWith("sbx_active");

    releaseLease();
    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_active");
    });
  });

  it("refreshes expiry on a successful write", async () => {
    const organization = await createOrganization();
    const interaction = await createInteraction(organization.id);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_refresh",
          repositoryContextKey: "ctx_refresh",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    vi.advanceTimersByTime(WEB_SESSION_TTL_MS - 60_000);
    const current = await getWebConversationRepositorySession(interaction.id);
    expect(current?.version).toBe(1);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: current?.version ?? null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_refresh",
          repositoryContextKey: "ctx_refresh",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:29:00.000Z",
        },
      },
    });

    vi.advanceTimersByTime(90_000);
    await expect(getWebConversationRepositorySession(interaction.id)).resolves.toMatchObject({
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_refresh",
        },
      },
      version: 2,
    });
  });

  it("does not delete a refreshed session when a stale versioned expiry cleanup runs", async () => {
    const organization = await createOrganization();
    const interaction = await createInteraction(organization.id);

    await setSession(interaction.id, {
      organizationId: organization.id,
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_stale",
          repositoryContextKey: "ctx_stale",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    const [expiredRow] = await db
      .select({
        version: schema.interactionRepositorySessions.version,
        expiresAt: schema.interactionRepositorySessions.expiresAt,
      })
      .from(schema.interactionRepositorySessions)
      .where(eq(schema.interactionRepositorySessions.interactionId, interaction.id))
      .limit(1);

    vi.advanceTimersByTime(WEB_SESSION_TTL_MS + 1);

    // Concurrent turn refreshes the row (new version + expiry) before stale cleanup runs.
    await db
      .update(schema.interactionRepositorySessions)
      .set({
        session: {
          repositorySandboxSession: {
            sandboxId: "sbx_refreshed",
            repositoryContextKey: "ctx_refreshed",
            createdAt: "2026-07-01T12:31:00.000Z",
            lastUsedAt: "2026-07-01T12:31:00.000Z",
          },
        },
        version: (expiredRow?.version ?? 1) + 1,
        expiresAt: new Date(Date.now() + WEB_SESSION_TTL_MS),
        updatedAt: new Date(),
      })
      .where(eq(schema.interactionRepositorySessions.interactionId, interaction.id));

    // Same compare-and-delete predicate used by expiry cleanup for the stale observation.
    const deleted = await db
      .delete(schema.interactionRepositorySessions)
      .where(
        and(
          eq(schema.interactionRepositorySessions.interactionId, interaction.id),
          eq(schema.interactionRepositorySessions.organizationId, organization.id),
          eq(schema.interactionRepositorySessions.version, expiredRow!.version),
          lte(schema.interactionRepositorySessions.expiresAt, expiredRow!.expiresAt),
        ),
      )
      .returning({
        interactionId: schema.interactionRepositorySessions.interactionId,
      });

    expect(deleted).toHaveLength(0);
    await expect(getWebConversationRepositorySession(interaction.id)).resolves.toMatchObject({
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_refreshed",
        },
      },
      version: (expiredRow?.version ?? 1) + 1,
    });
  });
});
