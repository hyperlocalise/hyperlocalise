import { setupWorkosLocalizationPermissions } from "@/lib/workos/setup-workos-localization-permissions";
import { setupWorkosLocalizationRoles } from "@/lib/workos/setup-workos-localization-roles";

async function main() {
  const roleResult = await setupWorkosLocalizationRoles();
  const permissionResult = await setupWorkosLocalizationPermissions();

  if (roleResult.skipped && permissionResult.skipped) {
    console.log(
      "Skipped WorkOS setup: WORKOS_API_KEY is missing or set to the test placeholder. Configure a real API key in .env and retry.",
    );
    return;
  }

  if (roleResult.created.length > 0) {
    console.log(`Created WorkOS environment roles: ${roleResult.created.join(", ")}`);
  } else if (!roleResult.skipped) {
    console.log(
      `WorkOS localization roles unchanged (${roleResult.unchanged.length}): ${roleResult.unchanged.join(", ")}`,
    );
  }

  if (!permissionResult.skipped) {
    if (permissionResult.permissionsCreated.length > 0) {
      console.log(`Created WorkOS permissions: ${permissionResult.permissionsCreated.join(", ")}`);
    }

    if (permissionResult.rolePermissionsAdded.length > 0) {
      console.log(
        `Added ${permissionResult.rolePermissionsAdded.length} missing role permission assignments`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
