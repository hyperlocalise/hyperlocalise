import { hc } from "hono/client";

import type { AppType } from "@/api/app";

export function createApiClient() {
  return hc<AppType>(typeof window !== "undefined" ? window.location.origin : "");
}

export type ApiClient = ReturnType<typeof createApiClient>;
