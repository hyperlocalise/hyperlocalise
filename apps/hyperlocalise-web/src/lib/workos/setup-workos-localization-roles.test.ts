import { ConflictException, NotFoundException } from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { getEnvironmentRoleMock, createEnvironmentRoleMock, getWorkosServerClientMock } = vi.hoisted(
  () => ({
    getEnvironmentRoleMock: vi.fn(),
    createEnvironmentRoleMock: vi.fn(),
    getWorkosServerClientMock: vi.fn(),
  }),
);

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: getWorkosServerClientMock,
}));

import { setupWorkosLocalizationRoles } from "./setup-workos-localization-roles";

function workosNotFound() {
  return new NotFoundException({
    path: "/authorization/roles/missing",
    requestID: "req_test_not_found",
    message: "not found",
  });
}

function workosConflict() {
  return new ConflictException({
    requestID: "req_test_conflict",
    message: "already exists",
  });
}

describe("setupWorkosLocalizationRoles", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    getEnvironmentRoleMock.mockReset();
    createEnvironmentRoleMock.mockReset();
    getWorkosServerClientMock.mockReset();
  });

  it("skips when WorkOS is not configured", async () => {
    vi.stubEnv("WORKOS_API_KEY", "test-workos-api-key");
    getWorkosServerClientMock.mockReturnValue({ authorization: {} });

    await expect(setupWorkosLocalizationRoles()).resolves.toEqual({
      created: [],
      unchanged: [],
      skipped: true,
    });

    expect(getEnvironmentRoleMock).not.toHaveBeenCalled();
  });

  it("creates only missing environment roles", async () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_real");
    getEnvironmentRoleMock.mockImplementation(async (slug: string) => {
      if (slug === "admin" || slug === "member") {
        return { slug, name: "Custom display name from WorkOS" };
      }

      throw workosNotFound();
    });
    createEnvironmentRoleMock.mockResolvedValue({});
    getWorkosServerClientMock.mockReturnValue({
      authorization: {
        getEnvironmentRole: getEnvironmentRoleMock,
        createEnvironmentRole: createEnvironmentRoleMock,
      },
    });

    const result = await setupWorkosLocalizationRoles();

    expect(result.skipped).toBe(false);
    expect(result.unchanged).toEqual(["admin", "member"]);
    expect(result.created).toEqual([
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
    ]);
    expect(createEnvironmentRoleMock).toHaveBeenCalledTimes(4);
    expect(createEnvironmentRoleMock).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "developer", name: "Developer" }),
    );
  });

  it("is idempotent when every role already exists", async () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_real");
    getEnvironmentRoleMock.mockResolvedValue({ slug: "admin", name: "Existing" });
    getWorkosServerClientMock.mockReturnValue({
      authorization: {
        getEnvironmentRole: getEnvironmentRoleMock,
        createEnvironmentRole: createEnvironmentRoleMock,
      },
    });

    const result = await setupWorkosLocalizationRoles();

    expect(result).toEqual({
      created: [],
      unchanged: [
        "admin",
        "localization_manager",
        "developer",
        "reviewer",
        "translator",
        "member",
      ],
      skipped: false,
    });
    expect(createEnvironmentRoleMock).not.toHaveBeenCalled();
  });

  it("treats create conflicts as unchanged without modifying the role", async () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_real");
    getEnvironmentRoleMock.mockRejectedValue(workosNotFound());
    createEnvironmentRoleMock.mockRejectedValue(workosConflict());
    getWorkosServerClientMock.mockReturnValue({
      authorization: {
        getEnvironmentRole: getEnvironmentRoleMock,
        createEnvironmentRole: createEnvironmentRoleMock,
      },
    });

    const result = await setupWorkosLocalizationRoles();

    expect(result.created).toEqual([]);
    expect(result.unchanged).toEqual([
      "admin",
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
      "member",
    ]);
  });
});
