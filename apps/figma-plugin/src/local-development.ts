import { normalizeAppUrl } from "./settings";

export function isLocalAppUrl(appUrl: string): boolean {
  try {
    const hostname = new URL(normalizeAppUrl(appUrl)).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
