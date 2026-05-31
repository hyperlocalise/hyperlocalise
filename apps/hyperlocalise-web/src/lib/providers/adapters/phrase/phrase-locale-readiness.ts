export type PhraseLocaleReadinessStatus = "ready" | "missing" | "unverified" | "excluded";

export function mapPhraseTranslationReadiness(input: {
  content?: string | null;
  state?: string | null;
  unverified?: boolean;
  excluded?: boolean;
}): PhraseLocaleReadinessStatus {
  if (input.excluded) {
    return "excluded";
  }

  const content = input.content?.trim();
  if (!content) {
    return "missing";
  }

  if (input.unverified) {
    return "unverified";
  }

  const state = (input.state ?? "").trim().toLowerCase();
  if (state === "translated") {
    return "ready";
  }

  return "unverified";
}

export function buildPhraseKeyExternalResourceId(keyId: string, branch: string | null) {
  const trimmedId = keyId.trim();
  const trimmedBranch = branch?.trim();
  if (!trimmedBranch) {
    return trimmedId;
  }

  return `${trimmedBranch}::${trimmedId}`;
}

export function buildPhraseKeySourcePath(keyName: string, branch: string | null) {
  const trimmedName = keyName.trim();
  const trimmedBranch = branch?.trim();
  if (!trimmedBranch) {
    return `keys/${trimmedName}`;
  }

  return `${trimmedBranch}/keys/${trimmedName}`;
}

export function buildPhraseUploadSourcePath(sourceLocale: string | null, filename: string) {
  const trimmedFilename = filename.trim();
  const trimmedLocale = sourceLocale?.trim();
  if (!trimmedLocale) {
    return `uploads/${trimmedFilename}`;
  }

  return `locales/${trimmedLocale}/${trimmedFilename}`;
}
