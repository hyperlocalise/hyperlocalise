import { getActiveOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";

export async function resolveOrganizationHasTmsIntegration(
  organizationId: string,
): Promise<boolean> {
  const credential = await getActiveOrganizationExternalTmsProviderCredential(organizationId);
  return credential !== null;
}
