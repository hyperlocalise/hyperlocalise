import { ConflictException, NotFoundException } from "@workos-inc/node";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import { WORKOS_ROLE_SLUG_BY_MEMBERSHIP_ROLE } from "@/lib/workos/localization-role-slugs";
import { getWorkosServerClient } from "@/lib/workos/server-client";
import {
  getWorkosPermissionSlugsForRole,
  WORKOS_LOCALIZATION_PERMISSION_DEFINITIONS,
} from "@/lib/workos/workos-localization-permission-definitions";
import { WORKOS_LOCALIZATION_ROLE_DEFINITIONS } from "@/lib/workos/workos-localization-role-definitions";

export type SetupWorkosLocalizationPermissionsResult = {
  permissionsCreated: string[];
  permissionsUnchanged: string[];
  rolePermissionsAdded: Array<{ roleSlug: string; permissionSlug: string }>;
  /** Environment roles missing in WorkOS; permission sync was skipped for these slugs. */
  rolesSkipped: string[];
  skipped: boolean;
};

function isWorkosSetupEnabled(apiKey: string | undefined) {
  if (!apiKey || apiKey === "test-workos-api-key") {
    return false;
  }

  return !apiKey.includes("placeholder");
}

async function permissionExists(
  workos: NonNullable<ReturnType<typeof getWorkosServerClient>>,
  slug: string,
) {
  try {
    await workos.authorization.getPermission(slug);
    return true;
  } catch (error) {
    if (error instanceof NotFoundException) {
      return false;
    }

    throw error;
  }
}

async function ensurePermissions(workos: NonNullable<ReturnType<typeof getWorkosServerClient>>) {
  const permissionsCreated: string[] = [];
  const permissionsUnchanged: string[] = [];

  for (const definition of WORKOS_LOCALIZATION_PERMISSION_DEFINITIONS) {
    if (await permissionExists(workos, definition.slug)) {
      permissionsUnchanged.push(definition.slug);
      continue;
    }

    try {
      await workos.authorization.createPermission({
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
      });
      permissionsCreated.push(definition.slug);
    } catch (error) {
      if (error instanceof ConflictException) {
        permissionsUnchanged.push(definition.slug);
        continue;
      }

      throw error;
    }
  }

  return { permissionsCreated, permissionsUnchanged };
}

async function environmentRoleExists(
  workos: NonNullable<ReturnType<typeof getWorkosServerClient>>,
  slug: string,
) {
  try {
    await workos.authorization.getEnvironmentRole(slug);
    return true;
  } catch (error) {
    if (error instanceof NotFoundException) {
      return false;
    }

    throw error;
  }
}

async function syncRolePermissions(
  workos: NonNullable<ReturnType<typeof getWorkosServerClient>>,
  role: OrganizationMembershipRole,
) {
  const roleSlug = WORKOS_ROLE_SLUG_BY_MEMBERSHIP_ROLE[role];
  if (!(await environmentRoleExists(workos, roleSlug))) {
    return { rolePermissionsAdded: [], roleSkipped: roleSlug };
  }

  const environmentRole = await workos.authorization.getEnvironmentRole(roleSlug);
  const assigned = new Set(environmentRole.permissions ?? []);
  const expected = getWorkosPermissionSlugsForRole(role);
  const rolePermissionsAdded: Array<{ roleSlug: string; permissionSlug: string }> = [];

  for (const permissionSlug of expected) {
    if (assigned.has(permissionSlug)) {
      continue;
    }

    await workos.authorization.addEnvironmentRolePermission(roleSlug, {
      permissionSlug,
    });
    rolePermissionsAdded.push({ roleSlug, permissionSlug });
  }

  return { rolePermissionsAdded, roleSkipped: null as string | null };
}

/**
 * Ensures Hyperlocalise capability permissions exist in WorkOS and attaches any
 * missing permissions to localization environment roles (additive only).
 */
export async function setupWorkosLocalizationPermissions(): Promise<SetupWorkosLocalizationPermissionsResult> {
  const workos = getWorkosServerClient();
  const apiKey = process.env.WORKOS_API_KEY;

  if (!workos || !isWorkosSetupEnabled(apiKey)) {
    return {
      permissionsCreated: [],
      permissionsUnchanged: [],
      rolePermissionsAdded: [],
      rolesSkipped: [],
      skipped: true,
    };
  }

  const { permissionsCreated, permissionsUnchanged } = await ensurePermissions(workos);
  const rolePermissionsAdded: Array<{ roleSlug: string; permissionSlug: string }> = [];
  const rolesSkipped: string[] = [];

  for (const definition of WORKOS_LOCALIZATION_ROLE_DEFINITIONS) {
    const { rolePermissionsAdded: added, roleSkipped } = await syncRolePermissions(
      workos,
      definition.slug as OrganizationMembershipRole,
    );
    rolePermissionsAdded.push(...added);
    if (roleSkipped) {
      rolesSkipped.push(roleSkipped);
    }
  }

  return {
    permissionsCreated,
    permissionsUnchanged,
    rolePermissionsAdded,
    rolesSkipped,
    skipped: false,
  };
}
