import { ConflictException, NotFoundException } from "@workos-inc/node";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  getPermissionMock,
  createPermissionMock,
  getEnvironmentRoleMock,
  addEnvironmentRolePermissionMock,
  getWorkosServerClientMock,
} = vi.hoisted(() => ({
  getPermissionMock: vi.fn(),
  createPermissionMock: vi.fn(),
  getEnvironmentRoleMock: vi.fn(),
  addEnvironmentRolePermissionMock: vi.fn(),
  getWorkosServerClientMock: vi.fn(),
}));

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: getWorkosServerClientMock,
}));

import { ORGANIZATION_CAPABILITIES } from "@/api/auth/policy";
import { getWorkosPermissionSlugsForRole } from "@/lib/workos/workos-localization-permission-definitions";
import { setupWorkosLocalizationPermissions } from "./setup-workos-localization-permissions";

function workosNotFound() {
  return new NotFoundException({
    path: "/authorization/permissions/missing",
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

describe("setupWorkosLocalizationPermissions", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    getPermissionMock.mockReset();
    createPermissionMock.mockReset();
    getEnvironmentRoleMock.mockReset();
    addEnvironmentRolePermissionMock.mockReset();
    getWorkosServerClientMock.mockReset();
  });

  it("skips when WorkOS is not configured", async () => {
    vi.stubEnv("WORKOS_API_KEY", "test-workos-api-key");
    getWorkosServerClientMock.mockReturnValue({ authorization: {} });

    await expect(setupWorkosLocalizationPermissions()).resolves.toEqual({
      permissionsCreated: [],
      permissionsUnchanged: [],
      rolePermissionsAdded: [],
      rolesSkipped: [],
      skipped: true,
    });

    expect(getPermissionMock).not.toHaveBeenCalled();
  });

  it("creates only missing permissions and adds missing role assignments", async () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_real");
    const existingPermissions = new Set(["workspace:read", "projects:read"]);
    getPermissionMock.mockImplementation(async (slug: string) => {
      if (existingPermissions.has(slug)) {
        return { slug };
      }

      throw workosNotFound();
    });
    createPermissionMock.mockResolvedValue({});
    getEnvironmentRoleMock.mockImplementation(async (slug: string) => ({
      slug,
      permissions: slug === "translator" ? ["workspace:read", "jobs:read"] : ["workspace:read"],
    }));
    addEnvironmentRolePermissionMock.mockResolvedValue({});
    getWorkosServerClientMock.mockReturnValue({
      authorization: {
        getPermission: getPermissionMock,
        createPermission: createPermissionMock,
        getEnvironmentRole: getEnvironmentRoleMock,
        addEnvironmentRolePermission: addEnvironmentRolePermissionMock,
      },
    });

    const result = await setupWorkosLocalizationPermissions();

    expect(result.skipped).toBe(false);
    expect(result.permissionsCreated.length).toBe(
      ORGANIZATION_CAPABILITIES.length - existingPermissions.size,
    );
    expect(result.permissionsUnchanged).toEqual(expect.arrayContaining([...existingPermissions]));
    expect(addEnvironmentRolePermissionMock).toHaveBeenCalled();
    expect(
      addEnvironmentRolePermissionMock.mock.calls.some(
        (call) =>
          call[0] === "translator" &&
          (call[1] as { permissionSlug: string }).permissionSlug === "jobs:create",
      ),
    ).toBe(true);
  });

  it("is idempotent when permissions and role assignments already exist", async () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_real");
    getPermissionMock.mockResolvedValue({ slug: "workspace:read" });
    getEnvironmentRoleMock.mockImplementation(async (slug: string) => ({
      slug,
      permissions: getWorkosPermissionSlugsForRole(
        slug as Parameters<typeof getWorkosPermissionSlugsForRole>[0],
      ),
    }));
    getWorkosServerClientMock.mockReturnValue({
      authorization: {
        getPermission: getPermissionMock,
        createPermission: createPermissionMock,
        getEnvironmentRole: getEnvironmentRoleMock,
        addEnvironmentRolePermission: addEnvironmentRolePermissionMock,
      },
    });

    const result = await setupWorkosLocalizationPermissions();

    expect(result.permissionsCreated).toEqual([]);
    expect(result.rolePermissionsAdded).toEqual([]);
    expect(result.rolesSkipped).toEqual([]);
    expect(createPermissionMock).not.toHaveBeenCalled();
    expect(addEnvironmentRolePermissionMock).not.toHaveBeenCalled();
  });

  it("skips missing environment roles and continues syncing other roles", async () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_real");
    getPermissionMock.mockResolvedValue({ slug: "workspace:read" });
    getEnvironmentRoleMock.mockImplementation(async (slug: string) => {
      if (slug === "translator") {
        throw workosNotFound();
      }

      return { slug, permissions: ["workspace:read"] };
    });
    addEnvironmentRolePermissionMock.mockResolvedValue({});
    getWorkosServerClientMock.mockReturnValue({
      authorization: {
        getPermission: getPermissionMock,
        createPermission: createPermissionMock,
        getEnvironmentRole: getEnvironmentRoleMock,
        addEnvironmentRolePermission: addEnvironmentRolePermissionMock,
      },
    });

    const result = await setupWorkosLocalizationPermissions();

    expect(result.rolesSkipped).toEqual(["translator"]);
    expect(addEnvironmentRolePermissionMock).not.toHaveBeenCalledWith(
      "translator",
      expect.anything(),
    );
    expect(addEnvironmentRolePermissionMock).toHaveBeenCalled();
  });

  it("treats create permission conflicts as unchanged", async () => {
    vi.stubEnv("WORKOS_API_KEY", "sk_test_real");
    getPermissionMock.mockRejectedValue(workosNotFound());
    createPermissionMock.mockRejectedValue(workosConflict());
    getEnvironmentRoleMock.mockResolvedValue({ slug: "member", permissions: [] });
    addEnvironmentRolePermissionMock.mockResolvedValue({});
    getWorkosServerClientMock.mockReturnValue({
      authorization: {
        getPermission: getPermissionMock,
        createPermission: createPermissionMock,
        getEnvironmentRole: getEnvironmentRoleMock,
        addEnvironmentRolePermission: addEnvironmentRolePermissionMock,
      },
    });

    const result = await setupWorkosLocalizationPermissions();

    expect(result.permissionsCreated).toEqual([]);
    expect(result.permissionsUnchanged).toEqual([...ORGANIZATION_CAPABILITIES]);
  });
});
