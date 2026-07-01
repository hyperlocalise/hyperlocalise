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
  getWebConversationRepositorySession,
  setWebConversationRepositorySession,
} from "./conversation-repository-session";

const WEB_SESSION_TTL_MS = 30 * 60 * 1000;

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
    setWebConversationRepositorySession("conv_expired", {
      repositorySandboxSession: {
        sandboxId: "sbx_expired",
        repositoryContextKey: "ctx",
        createdAt: "2026-07-01T12:00:00.000Z",
        lastUsedAt: "2026-07-01T12:00:00.000Z",
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
      setWebConversationRepositorySession(`conv_${index}`, {
        repositorySandboxSession: {
          sandboxId: `sbx_${index}`,
          repositoryContextKey: `ctx_${index}`,
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      });
    }

    setWebConversationRepositorySession("conv_overflow", {
      repositorySandboxSession: {
        sandboxId: "sbx_overflow",
        repositoryContextKey: "ctx_overflow",
        createdAt: "2026-07-01T12:00:00.000Z",
        lastUsedAt: "2026-07-01T12:00:00.000Z",
      },
    });

    await vi.waitFor(() => {
      expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sbx_0");
    });
    expect(getWebConversationRepositorySession("conv_overflow")).not.toBeNull();
  });
});
