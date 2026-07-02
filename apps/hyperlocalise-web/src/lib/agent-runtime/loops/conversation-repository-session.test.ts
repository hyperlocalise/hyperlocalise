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

import {
  acquireWebRepositorySandboxLease,
  getWebConversationRepositorySession,
  setWebConversationRepositorySession,
} from "./conversation-repository-session";

const WEB_SESSION_TTL_MS = 30 * 60 * 1000;

function setSession(
  conversationId: string,
  input: {
    baseVersion: number | null;
    session: Parameters<typeof setWebConversationRepositorySession>[1]["session"];
  },
) {
  return setWebConversationRepositorySession(conversationId, input);
}

describe("web conversation repository session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops the sandbox when a session expires", async () => {
    setSession("conv_expired", {
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

    expect(getWebConversationRepositorySession("conv_expired")).toBeNull();
    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_expired");
    });
  });

  it("stops the sandbox when the cache exceeds its entry limit", async () => {
    for (let index = 0; index < 200; index += 1) {
      setSession(`conv_${index}`, {
        baseVersion: null,
        session: {
          repositorySandboxSession: {
            sandboxId: `sbx_${index}`,
            repositoryContextKey: `ctx_${index}`,
            createdAt: "2026-07-01T12:00:00.000Z",
            lastUsedAt: "2026-07-01T12:00:00.000Z",
          },
        },
      });
    }

    setSession("conv_overflow", {
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_overflow",
          repositoryContextKey: "ctx_overflow",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_0");
    });
    expect(getWebConversationRepositorySession("conv_overflow")).not.toBeNull();
  });

  it("stops the overwritten sandbox when a session is replaced", async () => {
    setSession("conv_replace", {
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

    const current = getWebConversationRepositorySession("conv_replace");
    expect(current?.version).toBe(1);

    setSession("conv_replace", {
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
    expect(
      getWebConversationRepositorySession("conv_replace")?.session.repositorySandboxSession,
    ).toMatchObject({ sandboxId: "sbx_new" });
  });

  it("rejects stale writes and stops the sandbox from the losing turn", async () => {
    setSession("conv_race", {
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

    const staleRead = getWebConversationRepositorySession("conv_race");
    const current = getWebConversationRepositorySession("conv_race");
    expect(staleRead?.version).toBe(current?.version);

    setSession("conv_race", {
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

    const committed = setSession("conv_race", {
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
    expect(
      getWebConversationRepositorySession("conv_race")?.session.repositorySandboxSession,
    ).toMatchObject({ sandboxId: "sbx_winner" });
  });

  it("defers sandbox cleanup while a web turn holds an active lease", async () => {
    setSession("conv_active", {
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
    expect(getWebConversationRepositorySession("conv_active")).toBeNull();
    expect(stopRepositorySandboxMock).not.toHaveBeenCalledWith("sbx_active");

    releaseLease();
    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_active");
    });
  });

  it("defers sandbox cleanup on cache eviction while a lease is active", async () => {
    for (let index = 0; index < 200; index += 1) {
      setSession(`conv_${index}`, {
        baseVersion: null,
        session: {
          repositorySandboxSession: {
            sandboxId: `sbx_${index}`,
            repositoryContextKey: `ctx_${index}`,
            createdAt: "2026-07-01T12:00:00.000Z",
            lastUsedAt: "2026-07-01T12:00:00.000Z",
          },
        },
      });
    }

    const releaseLease = acquireWebRepositorySandboxLease("sbx_0");

    setSession("conv_overflow", {
      baseVersion: null,
      session: {
        repositorySandboxSession: {
          sandboxId: "sbx_overflow",
          repositoryContextKey: "ctx_overflow",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
    });

    expect(stopRepositorySandboxMock).not.toHaveBeenCalledWith("sbx_0");

    releaseLease();
    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_0");
    });
  });
});
