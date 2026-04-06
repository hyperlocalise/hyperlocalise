import { env } from "@/lib/env";

export type WorkosAuthKitConfig = {
  clientId: string;
  apiKey: string;
  redirectUri: string;
};

export function getWorkosAuthKitConfig(): WorkosAuthKitConfig | null {
  if (!env.WORKOS_CLIENT_ID || !env.WORKOS_API_KEY || !env.WORKOS_REDIRECT_URI) {
    return null;
  }

  return {
    clientId: env.WORKOS_CLIENT_ID,
    apiKey: env.WORKOS_API_KEY,
    redirectUri: env.WORKOS_REDIRECT_URI,
  };
}
