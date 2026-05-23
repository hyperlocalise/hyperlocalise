import { parseSmartlingCredentials } from "./smartling-credentials";
import { SmartlingApiClient } from "./smartling-api";

type SmartlingProjectLike = {
  sourceLocale?: string | null;
  targetLocales?: string[] | null;
  providerMetadata?: Record<string, unknown> | null;
};

export async function resolveSmartlingAccountUid(input: {
  secretMaterial: string;
  externalProjectId: string;
  project?: SmartlingProjectLike;
}): Promise<string | null> {
  const credentials = parseSmartlingCredentials(input.secretMaterial);
  if (credentials.accountUid?.trim()) {
    return credentials.accountUid.trim();
  }

  const metadataAccountUid = readMetadataAccountUid(input.project?.providerMetadata);
  if (metadataAccountUid) {
    return metadataAccountUid;
  }

  const projectId = input.externalProjectId.trim() || credentials.projectId?.trim();
  if (!projectId) {
    return null;
  }

  const client = new SmartlingApiClient({ credentials });
  try {
    const details = await client.getProjectDetails(projectId);
    return details.accountUid?.trim() || null;
  } catch {
    return null;
  }
}

function readMetadataAccountUid(metadata: Record<string, unknown> | null | undefined) {
  const accountUid = metadata?.accountUid;
  return typeof accountUid === "string" && accountUid.trim() ? accountUid.trim() : null;
}

export function uniqueLocales(locales: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const locale of locales) {
    const trimmed = locale.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}
