import type { SimpleIcon } from "simple-icons";
import { siCrowdin } from "simple-icons";

export type TmsProviderBranding = {
  logo: string;
  name: string;
  icon?: SimpleIcon;
};

const TMS_PROVIDER_BRANDING: Record<string, TmsProviderBranding> = {
  crowdin: {
    logo: "/images/tms/crowdin.png",
    name: "Crowdin",
    icon: siCrowdin,
  },
  lokalise: {
    logo: "/images/tms/lokalise.webp",
    name: "Lokalise",
  },
  phrase: {
    logo: "/images/tms/phrase.png",
    name: "Phrase",
  },
  smartling: {
    logo: "/images/tms/smartling.png",
    name: "Smartling",
  },
  native: {
    logo: "/images/logo.png",
    name: "Hyperlocalise",
  },
};

const NATIVE_BRANDING = TMS_PROVIDER_BRANDING.native;

export function getTmsProviderBranding(
  providerKind: string | null | undefined,
): TmsProviderBranding {
  if (!providerKind) {
    return NATIVE_BRANDING;
  }

  return (
    TMS_PROVIDER_BRANDING[providerKind] ?? {
      logo: NATIVE_BRANDING.logo,
      name: providerKind.charAt(0).toUpperCase() + providerKind.slice(1),
    }
  );
}
