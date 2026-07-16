import { CrowdinAppInboxContent } from "./_components/crowdin-app-inbox-content";
import { getCrowdinAppBaseUrl } from "@/lib/crowdin-app/manifest";

type CrowdinAppInboxPageProps = {
  searchParams: Promise<{
    jwtToken?: string;
    origin?: string;
    clientId?: string;
  }>;
};

export default async function CrowdinAppInboxPage({ searchParams }: CrowdinAppInboxPageProps) {
  const params = await searchParams;
  const appBaseUrl = getCrowdinAppBaseUrl() ?? "";

  return <CrowdinAppInboxContent appBaseUrl={appBaseUrl} jwtToken={params.jwtToken ?? null} />;
}
