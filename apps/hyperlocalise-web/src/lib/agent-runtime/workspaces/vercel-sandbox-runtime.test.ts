import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { deleteSandboxMock, envMock, vercelCtor } = vi.hoisted(() => {
  const deleteSandboxMock = vi.fn();
  const envMock: {
    VERCEL_SANDBOX_API_TOKEN?: string;
    VERCEL_SANDBOX_TEAM_ID?: string;
    VERCEL_SANDBOX_TEAM_SLUG?: string;
  } = {
    VERCEL_SANDBOX_API_TOKEN: "test-token",
    VERCEL_SANDBOX_TEAM_ID: "team_123",
    VERCEL_SANDBOX_TEAM_SLUG: undefined,
  };
  const vercelCtor = vi.fn(function Vercel(_options: unknown) {
    return { sandboxes: { deleteSandbox: deleteSandboxMock } };
  });

  return { deleteSandboxMock, envMock, vercelCtor };
});

vi.mock("@/lib/env", () => ({ env: envMock }));
vi.mock("@vercel/sdk", () => ({ Vercel: vercelCtor }));

import {
  deleteVercelSandbox,
  resolveVercelSandboxDeleteRequest,
  SandboxDeleteConfigurationError,
} from "./vercel-sandbox-runtime";

describe("vercel sandbox runtime cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.VERCEL_SANDBOX_API_TOKEN = "test-token";
    envMock.VERCEL_SANDBOX_TEAM_ID = "team_123";
    envMock.VERCEL_SANDBOX_TEAM_SLUG = undefined;
    deleteSandboxMock.mockResolvedValue({ sandbox: { name: "sbx_1" } });
  });

  it("deletes a sandbox through the Vercel SDK with teamId", async () => {
    await deleteVercelSandbox("sbx_1");

    expect(vercelCtor).toHaveBeenCalledWith({ bearerToken: "test-token" });
    expect(deleteSandboxMock).toHaveBeenCalledWith({ name: "sbx_1", teamId: "team_123" });
  });

  it("uses team slug when teamId is absent", async () => {
    envMock.VERCEL_SANDBOX_TEAM_ID = undefined;
    envMock.VERCEL_SANDBOX_TEAM_SLUG = "my-team";

    await deleteVercelSandbox("sbx_2");

    expect(deleteSandboxMock).toHaveBeenCalledWith({ name: "sbx_2", slug: "my-team" });
  });

  it("throws a typed configuration error before calling the SDK when token is missing", () => {
    expect(() =>
      resolveVercelSandboxDeleteRequest("sbx_3", {
        VERCEL_SANDBOX_TEAM_ID: "team_123",
      }),
    ).toThrow(SandboxDeleteConfigurationError);
  });

  it("throws a typed configuration error before calling the SDK when team scope is missing", () => {
    expect(() =>
      resolveVercelSandboxDeleteRequest("sbx_4", {
        VERCEL_SANDBOX_API_TOKEN: "test-token",
      }),
    ).toThrow(SandboxDeleteConfigurationError);
  });

  it("does not construct the SDK when runtime deletion config is missing", async () => {
    envMock.VERCEL_SANDBOX_API_TOKEN = undefined;

    await expect(deleteVercelSandbox("sbx_5")).rejects.toThrow(SandboxDeleteConfigurationError);

    expect(vercelCtor).not.toHaveBeenCalled();
    expect(deleteSandboxMock).not.toHaveBeenCalled();
  });
});
