import { env } from "@/lib/env";

export function getCrowdinAppBaseUrl() {
  return (
    env.HYPERLOCALISE_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (env.NODE_ENV === "development" ? "http://localhost:3000" : undefined)
  );
}

export function buildCrowdinAppManifest() {
  const baseUrl = getCrowdinAppBaseUrl();
  const clientId = env.CROWDIN_APP_CLIENT_ID;

  return {
    identifier: "hyperlocalise-inbox",
    name: "Hyperlocalise",
    description: "Agent chat inbox for Crowdin projects connected to Hyperlocalise.",
    logo: "/logo.svg",
    baseUrl,
    authentication: clientId
      ? {
          type: "crowdin_app" as const,
          clientId,
        }
      : {
          type: "none" as const,
        },
    events: {
      installed: "/api/crowdin-app/events/installed",
      uninstall: "/api/crowdin-app/events/uninstall",
    },
    scopes: ["project"],
    modules: {
      "project-menu": [
        {
          key: "inbox",
          name: "Hyperlocalise",
          url: "/crowdin-app/inbox",
        },
      ],
    },
  };
}
