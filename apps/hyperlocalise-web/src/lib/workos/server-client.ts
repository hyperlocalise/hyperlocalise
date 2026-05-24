import { WorkOS } from "@workos-inc/node";

import { getWorkosAuthKitConfig } from "@/lib/workos/config";

let workosClient: WorkOS | null | undefined;

export function getWorkosServerClient(): WorkOS | null {
  if (workosClient !== undefined) {
    return workosClient;
  }

  const config = getWorkosAuthKitConfig();
  if (!config) {
    workosClient = null;
    return workosClient;
  }

  workosClient = new WorkOS(config.apiKey);
  return workosClient;
}

export function isLocallyManagedWorkosOrganization(workosOrganizationId: string) {
  return workosOrganizationId.startsWith("local_org_");
}
