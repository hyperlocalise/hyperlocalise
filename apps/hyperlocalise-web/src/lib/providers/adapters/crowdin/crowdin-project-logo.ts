import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";

const SAFE_DATA_IMAGE_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i;

export function sanitizeCrowdinProjectLogo(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("data:image/")) {
    return SAFE_DATA_IMAGE_PATTERN.test(trimmed) ? trimmed : null;
  }

  return sanitizeExternalUrl(trimmed);
}
