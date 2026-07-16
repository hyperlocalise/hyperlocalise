import { env } from "@/lib/env";

const DEFAULT_FRAME_ANCESTORS = [
  "https://crowdin.com",
  "https://*.crowdin.com",
  "https://crowdin.cloud",
  "https://*.crowdin.cloud",
];

export function getCrowdinAppFrameAncestors(): string[] {
  const fromEnv = env.CROWDIN_APP_FRAME_ANCESTORS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_FRAME_ANCESTORS;
}

export function buildCrowdinAppFrameAncestorsCsp() {
  return `frame-ancestors ${getCrowdinAppFrameAncestors().join(" ")};`;
}
