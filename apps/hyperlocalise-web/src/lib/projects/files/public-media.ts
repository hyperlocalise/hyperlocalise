import { env } from "@/lib/env";

export const PUBLIC_MEDIA_METADATA_FLAG = "publicMedia" as const;

export type PublicMediaStoredFileLike = {
  contentType: string;
  metadata: Record<string, unknown> | null | undefined;
};

/** Only explicitly opted-in image outputs are served on the public media route. */
export function isPublicMediaStoredFile(file: PublicMediaStoredFileLike): boolean {
  if (file.metadata?.[PUBLIC_MEDIA_METADATA_FLAG] !== true) {
    return false;
  }

  return file.contentType.toLowerCase().startsWith("image/");
}

export function publicMediaMetadata(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    [PUBLIC_MEDIA_METADATA_FLAG]: true,
  };
}

/** Public, unauthenticated media path — no org/project/credentials. */
export function publicMediaAssetPath(fileId: string) {
  return `/api/public/media/${encodeURIComponent(fileId)}`;
}

export function publicMediaAssetUrl(input: { fileId: string; origin?: string | null }) {
  const path = publicMediaAssetPath(input.fileId);
  const origin =
    input.origin?.replace(/\/$/, "") ||
    env.HYPERLOCALISE_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    null;

  if (!origin) {
    return path;
  }

  return `${origin}${path}`;
}
