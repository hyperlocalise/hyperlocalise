import { env } from "@/lib/env";

export type WorkosAuthKitConfig = {
  clientId: string;
  apiKey: string;
  redirectUri: string;
  cookiePassword: string;
};

export function getWorkosAuthKitConfig(): WorkosAuthKitConfig | null {
  const redirectUri = env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? env.WORKOS_REDIRECT_URI;

  if (!env.WORKOS_CLIENT_ID || !env.WORKOS_API_KEY || !redirectUri || !env.WORKOS_COOKIE_PASSWORD) {
    return null;
  }

  return {
    clientId: env.WORKOS_CLIENT_ID,
    apiKey: env.WORKOS_API_KEY,
    redirectUri,
    cookiePassword: env.WORKOS_COOKIE_PASSWORD,
  };
}
