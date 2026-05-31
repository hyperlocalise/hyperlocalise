import { ConflictException, NotFoundException } from "@workos-inc/node";

import { getWorkosServerClient } from "@/lib/workos/server-client";
import { WORKOS_LOCALIZATION_ROLE_DEFINITIONS } from "@/lib/workos/workos-localization-role-definitions";

export type SetupWorkosLocalizationRolesResult = {
  /** Roles created on this run. */
  created: string[];
  /** Roles that already existed; name, description, and permissions were not modified. */
  unchanged: string[];
  skipped: boolean;
};

function isWorkosSetupEnabled(apiKey: string | undefined) {
  if (!apiKey || apiKey === "test-workos-api-key") {
    return false;
  }

  return !apiKey.includes("placeholder");
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

/**
 * Ensures Hyperlocalise localization role slugs exist as WorkOS environment roles.
 *
 * Idempotent: re-running only creates missing slugs. Existing roles are never updated —
 * customized names, descriptions, and permissions in WorkOS are left as-is.
 */
export async function setupWorkosLocalizationRoles(): Promise<SetupWorkosLocalizationRolesResult> {
  const workos = getWorkosServerClient();
  const apiKey = process.env.WORKOS_API_KEY;

  if (!workos || !isWorkosSetupEnabled(apiKey)) {
    return { created: [], unchanged: [], skipped: true };
  }

  const created: string[] = [];
  const unchanged: string[] = [];

  for (const definition of WORKOS_LOCALIZATION_ROLE_DEFINITIONS) {
    if (await environmentRoleExists(workos, definition.slug)) {
      unchanged.push(definition.slug);
      continue;
    }

    try {
      await workos.authorization.createEnvironmentRole({
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
      });
      created.push(definition.slug);
    } catch (error) {
      if (error instanceof ConflictException) {
        unchanged.push(definition.slug);
        continue;
      }

      throw error;
    }
  }

  return { created, unchanged, skipped: false };
}
