import { setupWorkosLocalizationRoles } from "@/lib/workos/setup-workos-localization-roles";

async function main() {
  const result = await setupWorkosLocalizationRoles();

  if (result.skipped) {
    console.log(
      "Skipped WorkOS setup: WORKOS_API_KEY is missing or set to the test placeholder. Configure a real API key in .env and retry.",
    );
    return;
  }

  if (result.created.length === 0) {
    console.log(
      `WorkOS localization roles unchanged (${result.unchanged.length}): ${result.unchanged.join(", ")}`,
    );
    return;
  }

  console.log(`Created WorkOS environment roles: ${result.created.join(", ")}`);

  if (result.unchanged.length > 0) {
    console.log(`Left unchanged: ${result.unchanged.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
