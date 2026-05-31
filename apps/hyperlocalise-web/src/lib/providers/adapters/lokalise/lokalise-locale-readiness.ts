export type LokaliseLocaleReadinessStatus = "ready" | "missing" | "unverified" | "excluded";

export function mapLokaliseTranslationReadiness(input: {
  content?: string | null;
  isUnverified?: boolean;
  isReviewed?: boolean;
  isArchived?: boolean;
  isHidden?: boolean;
}): LokaliseLocaleReadinessStatus {
  if (input.isArchived || input.isHidden) {
    return "excluded";
  }

  const content = input.content?.trim();
  if (!content) {
    return "missing";
  }

  if (input.isUnverified) {
    return "unverified";
  }

  if (input.isReviewed) {
    return "ready";
  }

  return "unverified";
}

export function buildLokaliseKeyExternalResourceId(keyId: number) {
  return String(keyId);
}

export function buildLokaliseKeySourcePath(keyName: string, filename: string | null) {
  const trimmedName = keyName.trim();
  const trimmedFilename = filename?.trim();
  if (trimmedFilename) {
    return `files/${trimmedFilename}/keys/${trimmedName}`;
  }

  return `keys/${trimmedName}`;
}

export function buildLokaliseFileExternalResourceId(platform: string, filename: string) {
  return `${platform.trim()}::${filename.trim()}`;
}

export function buildLokaliseFileSourcePath(
  sourceLocale: string | null,
  platform: string,
  filename: string,
) {
  const trimmedFilename = filename.trim();
  const trimmedPlatform = platform.trim();
  const trimmedLocale = sourceLocale?.trim();
  if (trimmedLocale) {
    return `locales/${trimmedLocale}/${trimmedPlatform}/${trimmedFilename}`;
  }

  return `files/${trimmedPlatform}/${trimmedFilename}`;
}
