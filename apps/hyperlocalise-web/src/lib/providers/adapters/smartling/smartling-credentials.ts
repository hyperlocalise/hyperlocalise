export type SmartlingCredentials = {
  userIdentifier: string;
  userSecret: string;
  accountUid?: string;
  projectId?: string;
};

export function parseSmartlingCredentials(secretMaterial: string): SmartlingCredentials {
  const trimmed = secretMaterial.trim();
  if (!trimmed) {
    throw new Error("smartling_credentials_invalid");
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const userIdentifier = readCredentialField(record, ["userIdentifier", "userId", "user_id"]);
      const userSecret = readCredentialField(record, ["userSecret", "secret", "user_secret"]);
      if (userIdentifier && userSecret) {
        return {
          userIdentifier,
          userSecret,
          accountUid: readOptionalCredentialField(record, [
            "accountUid",
            "accountId",
            "account_id",
          ]),
          projectId: readOptionalCredentialField(record, ["projectId", "project_id"]),
        };
      }
    }
  } catch {
    // Fall through to compact credential forms.
  }

  const colonParts = trimmed.split(":");
  if (colonParts.length === 4) {
    const [userIdentifier, userSecret, accountUid, projectId] = colonParts;
    if (userIdentifier && userSecret) {
      return {
        userIdentifier,
        userSecret,
        accountUid: accountUid || undefined,
        projectId: projectId || undefined,
      };
    }
  }

  if (colonParts.length === 3) {
    const [userIdentifier, userSecret, accountUid] = colonParts;
    if (userIdentifier && userSecret) {
      return {
        userIdentifier,
        userSecret,
        accountUid: accountUid || undefined,
      };
    }
  }

  const [userIdentifier, ...secretParts] = colonParts;
  const userSecret = secretParts.join(":");
  if (userIdentifier && userSecret) {
    return { userIdentifier, userSecret };
  }

  throw new Error("smartling_credentials_invalid");
}

function readCredentialField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readOptionalCredentialField(record: Record<string, unknown>, keys: string[]) {
  return readCredentialField(record, keys) ?? undefined;
}
